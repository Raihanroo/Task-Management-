from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.deps import get_current_user
from core.limits import get_effective_limits
from db import get_db
from models import Project, ProjectMember, Task, User
from schemas import (
    MyProjectAccess,
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberPermissionUpdate,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectUpdate,
)

router = APIRouter(prefix="/projects", tags=["Projects"])


async def get_project_or_404(project_id: int, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


async def get_membership(project_id: int, user_id: int, db: AsyncSession) -> ProjectMember | None:
    return (await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )).scalar_one_or_none()


async def require_project_owner(project: Project, user: User) -> None:
    if user.role != "admin" and project.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the project owner can perform this action")


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Project:
    if current_user.role != "admin":
        limits = await get_effective_limits(db, current_user.id)
        count = await db.scalar(select(func.count()).select_from(Project).where(Project.owner_id == current_user.id))
        if count >= limits.max_projects:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project creation limit reached")
    project = Project(**data.model_dump(), owner_id=current_user.id)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Project]:
    if current_user.role == "admin":
        statement = select(Project)
    else:
        statement = select(Project).outerjoin(
            ProjectMember, ProjectMember.project_id == Project.id
        ).where((Project.owner_id == current_user.id) | (ProjectMember.user_id == current_user.id)).distinct()
    return list((await db.execute(statement)).scalars().all())


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Project:
    project = await get_project_or_404(project_id, db)
    if current_user.role != "admin" and project.owner_id != current_user.id:
        if await get_membership(project_id, current_user.id, db) is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this project")
    return project


def _member_out(member: ProjectMember, username: str | None) -> ProjectMemberResponse:
    return ProjectMemberResponse(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        username=username,
        can_edit=member.can_edit,
    )


@router.post("/{project_id}/members", response_model=ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: int,
    data: ProjectMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectMemberResponse:
    """Owner/admin adds a member by username (or user_id). can_edit=False means view-only."""
    project = await get_project_or_404(project_id, db)
    await require_project_owner(project, current_user)

    if data.user_id is not None:
        target = await db.get(User, data.user_id)
    else:
        target = await db.scalar(select(User).where(User.username == data.username.strip()))
    if target is None or target.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not target.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This user account is banned")
    if target.id == project.owner_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The owner already has full project access")
    if await get_membership(project_id, target.id, db):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User is already a project member")

    member = ProjectMember(project_id=project_id, user_id=target.id, can_edit=data.can_edit)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return _member_out(member, target.username)


@router.patch("/{project_id}/members/{user_id}", response_model=ProjectMemberResponse)
async def update_member_permission(
    project_id: int,
    user_id: int,
    data: ProjectMemberPermissionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectMemberResponse:
    project = await get_project_or_404(project_id, db)
    await require_project_owner(project, current_user)
    member = await get_membership(project_id, user_id, db)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project member not found")
    member.can_edit = data.can_edit
    await db.commit()
    await db.refresh(member)
    target = await db.get(User, user_id)
    return _member_out(member, target.username if target else None)


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    project_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Remove a member. Tasks assigned to them in this project become unassigned
    (a non-member could not see them anyway)."""
    project = await get_project_or_404(project_id, db)
    await require_project_owner(project, current_user)
    member = await get_membership(project_id, user_id, db)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project member not found")
    await db.execute(
        update(Task)
        .where(Task.project_id == project_id, Task.assigned_to_id == user_id)
        .values(assigned_to_id=None)
    )
    await db.delete(member)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{project_id}", response_model=ProjectResponse)
@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Project:
    """Only the project owner (or admin) can change project metadata.
    Editors/members can change tasks, never the project itself."""
    project = await get_project_or_404(project_id, db)
    await require_project_owner(project, current_user)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Owner/admin only. Removes the project together with its tasks and member rows."""
    project = await get_project_or_404(project_id, db)
    await require_project_owner(project, current_user)
    await db.execute(delete(Task).where(Task.project_id == project_id))
    await db.execute(delete(ProjectMember).where(ProjectMember.project_id == project_id))
    await db.delete(project)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/my-access", response_model=MyProjectAccess)
async def my_access(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MyProjectAccess:
    """What the current user may do in this project (drives the frontend buttons)."""
    project = await get_project_or_404(project_id, db)
    if project.owner_id == current_user.id:
        return MyProjectAccess(role="owner", is_owner=True, can_edit=True, can_manage_members=True)
    if current_user.role == "admin":
        return MyProjectAccess(role="admin", is_owner=False, can_edit=True, can_manage_members=True)
    member = await get_membership(project_id, current_user.id, db)
    if member is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this project")
    return MyProjectAccess(
        role="editor" if member.can_edit else "viewer",
        is_owner=False,
        can_edit=member.can_edit,
        can_manage_members=False,
    )


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
async def list_members(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProjectMemberResponse]:
    project = await get_project_or_404(project_id, db)
    await require_project_owner(project, current_user)
    rows = await db.execute(
        select(ProjectMember, User.username)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.id)
    )
    return [_member_out(m, uname) for m, uname in rows.all()]
