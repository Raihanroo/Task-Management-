from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.deps import get_current_user
from core.limits import get_effective_limits
from db import get_db
from models import Project, Task, User
from routers.projects import get_membership, get_project_or_404
from schemas import TaskCreate, TaskCreateAny, TaskResponse, TaskStatusUpdate, TaskUpdate

router = APIRouter(tags=["Tasks"])


async def can_edit_project(project: Project, user: User, db: AsyncSession) -> bool:
    if user.role == "admin" or project.owner_id == user.id:
        return True
    member = await get_membership(project.id, user.id, db)
    return member is not None and member.can_edit


def is_owner_or_admin(project: Project, user: User) -> bool:
    return user.role == "admin" or project.owner_id == user.id


async def can_view_task(task: Task, user: User, db: AsyncSession) -> bool:
    if user.role == "admin":
        return True
    if task.project_id is None:
        return user.id in (task.assigned_to_id, task.created_by_id)
    project = await db.get(Project, task.project_id)
    return project is not None and (
        project.owner_id == user.id or task.assigned_to_id == user.id
    )


async def get_task_or_404(task_id: int, db: AsyncSession) -> Task:
    task = await db.get(Task, task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task


async def resolve_assignee_id(
    assigned_to_id: int | None,
    assigned_to_username: str | None,
    db: AsyncSession,
) -> int | None:
    if assigned_to_id is not None:
        return assigned_to_id
    if assigned_to_username:
        user = await db.scalar(
            select(User).where(User.username == assigned_to_username)
        )
        if user is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Assignee username not found"
            )
        return user.id
    return None


async def validate_assignee(
    project: Project, assignee_id: int, db: AsyncSession
) -> None:
    assignee = await db.get(User, assignee_id)
    if assignee is None or not assignee.is_active:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Assignee must be an active user"
        )
    if (
        assignee_id != project.owner_id
        and await get_membership(project.id, assignee_id, db) is None
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Assignee must be a project member"
        )


@router.post(
    "/projects/{project_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    project_id: int,
    data: TaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Task:
    project = await get_project_or_404(project_id, db)
    if not await can_edit_project(project, current_user, db):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You do not have permission to create tasks in this project",
        )
    assignee_id = await resolve_assignee_id(
        data.assigned_to_id, data.assigned_to_username, db
    )
    if assignee_id is not None:
        await validate_assignee(project, assignee_id, db)
    # Limits apply to normal users only; admin is unlimited
    if current_user.role != "admin":
        limits = await get_effective_limits(db, current_user.id)
        # per-project cap follows the project owner's quota
        project_limits = await get_effective_limits(db, project.owner_id)
        created_count = await db.scalar(
            select(func.count())
            .select_from(Task)
            .where(Task.created_by_id == current_user.id)
        )
        project_count = await db.scalar(
            select(func.count()).select_from(Task).where(Task.project_id == project_id)
        )
        if created_count >= limits.max_tasks:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Task creation limit reached"
            )
        if project_count >= project_limits.max_tasks_per_project:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "This project has reached its task limit"
            )
    task = Task(
        title=data.title,
        description=data.description or "",
        project_id=project_id,
        assigned_to_id=assignee_id,
        created_by_id=current_user.id,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.get("/tasks", response_model=list[TaskResponse])
async def list_my_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Task]:
    """My Tasks: tasks assigned to me (any project) + my own standalone tasks."""
    statement = (
        select(Task)
        .where(
            or_(
                Task.assigned_to_id == current_user.id,
                and_(Task.project_id.is_(None), Task.created_by_id == current_user.id),
            )
        )
        .order_by(Task.id)
    )
    return list((await db.execute(statement)).scalars().all())


@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task_any(
    data: TaskCreateAny,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Task:
    """project_id given -> same rules as POST /projects/{id}/tasks.
    project_id empty -> personal standalone task, always assigned to the creator."""
    if data.project_id is not None:
        return await create_task(
            data.project_id,
            TaskCreate(
                title=data.title,
                description=data.description,
                assigned_to_id=data.assigned_to_id,
                assigned_to_username=data.assigned_to_username,
            ),
            db,
            current_user,
        )
    assignee_id = await resolve_assignee_id(
        data.assigned_to_id, data.assigned_to_username, db
    )
    if assignee_id is not None and assignee_id != current_user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Standalone tasks can only be assigned to yourself. Create the task inside a project to assign it to someone else.",
        )
    if current_user.role != "admin":
        limits = await get_effective_limits(db, current_user.id)
        created_count = await db.scalar(
            select(func.count())
            .select_from(Task)
            .where(Task.created_by_id == current_user.id)
        )
        if created_count >= limits.max_tasks:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Task creation limit reached"
            )
    task = Task(
        title=data.title,
        description=data.description or "",
        project_id=None,
        assigned_to_id=current_user.id,
        created_by_id=current_user.id,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.get("/projects/{project_id}/tasks", response_model=list[TaskResponse])
async def list_project_tasks(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Task]:
    project = await get_project_or_404(project_id, db)
    statement = select(Task).where(Task.project_id == project_id)
    if not is_owner_or_admin(project, current_user):
        if await get_membership(project_id, current_user.id, db) is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "You do not have access to this project"
            )
        # members see only the tasks assigned to them; owner/admin see all
        statement = statement.where(Task.assigned_to_id == current_user.id)
    return list((await db.execute(statement)).scalars().all())


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = await get_task_or_404(task_id, db)
    if not await can_view_task(task, current_user, db):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You do not have access to this task"
        )
    return task

@router.put("/tasks/{task_id}", response_model=TaskResponse)
@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = await get_task_or_404(task_id, db)
    if task.project_id is None:
        # standalone task: only its creator (or admin) edits it; no reassignment
        if current_user.role != "admin" and task.created_by_id != current_user.id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "You do not have access to this task"
            )
        update_data = data.model_dump(exclude_unset=True)
        username = update_data.pop("assigned_to_username", None)
        if "assigned_to_id" not in update_data and username and username.strip():
            update_data["assigned_to_id"] = await resolve_assignee_id(None, username, db)
        new_assignee = update_data.pop("assigned_to_id", None)
        if new_assignee is not None and new_assignee != task.assigned_to_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Standalone tasks cannot be reassigned",
            )
        if update_data.get("description", "") is None:
            update_data["description"] = ""
        for field, value in update_data.items():
            if value is not None:
                setattr(task, field, value)
        await db.commit()
        await db.refresh(task)
        return task
    project = await get_project_or_404(task.project_id, db)
    if not await can_edit_project(project, current_user, db):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You do not have edit permission for this project",
        )
        
    update_data = data.model_dump(exclude_unset=True)

# username -> id resolve (frontend username pathay)

    username = update_data.pop("assigned_to_username", None)
    if "assigned_to_id" not in update_data and username is not None:
        if username.strip() == "":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "assigned_to_id cannot be null"
            )
        update_data["assigned_to_id"] = await resolve_assignee_id(None, username, db)

    if "description" in update_data and update_data["description"] is None:
        update_data["description"] = ""

    if "assigned_to_id" in update_data:
        if not is_owner_or_admin(project, current_user):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Only the project owner can reassign tasks"
            )
        if update_data["assigned_to_id"] is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "assigned_to_id cannot be null"
            )
        await validate_assignee(project, update_data["assigned_to_id"], db)
    for field, value in update_data.items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/tasks/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: int,
    data: TaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Task:
    task = await get_task_or_404(task_id, db)
    if not await can_view_task(task, current_user, db):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You do not have access to this task"
        )
    task.completed = data.completed
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    task = await get_task_or_404(task_id, db)
    if task.project_id is None:
        if current_user.role != "admin" and task.created_by_id != current_user.id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "You do not have access to this task"
            )
        await db.delete(task)
        await db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    project = await get_project_or_404(task.project_id, db)
    if not is_owner_or_admin(project, current_user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only the project owner can delete tasks"
        )
    await db.delete(task)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
