import math

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.deps import require_role
from core.limits import get_effective_limits, get_limits, get_user_limit_row
from core.users import soft_delete_user
from db import get_db
from models import Project, SystemLimit, Task, User, UserLimit
from schemas import (
    PaginatedUsersResponse,
    SystemLimitResponse,
    SystemLimitUpdate,
    SystemSettingsResponse,
    SystemSettingsUpdate,
    UserDetailResponse,
    UserLimitsResponse,
    UserLimitsUpdate,
    UserResponse,
    UserStatusUpdate,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


async def _get_user_or_404(user_id: int, db: AsyncSession) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


async def _is_last_active_admin(user: User, db: AsyncSession) -> bool:
    if user.role != "admin" or not user.is_active or user.deleted_at is not None:
        return False
    count = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.role == "admin", User.is_active.is_(True), User.deleted_at.is_(None))
    )
    return (count or 0) <= 1


# ---------------------------------------------------------------- users
@router.get("/users", response_model=PaginatedUsersResponse)
async def list_all_users(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    skip: int | None = Query(None, ge=0),
    include_deleted: bool = False,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> PaginatedUsersResponse:
    """Backend-paginated user directory (soft-deleted users hidden unless include_deleted)."""
    conditions = []
    if not include_deleted:
        conditions.append(User.deleted_at.is_(None))
    if search and search.strip():
        term = f"%{search.strip()}%"
        search_cond = [User.username.ilike(term), User.email.ilike(term)]
        if search.strip().isdigit():
            search_cond.append(User.id == int(search.strip()))
        conditions.append(or_(*search_cond))

    total = await db.scalar(select(func.count()).select_from(User).where(*conditions)) or 0
    offset = skip if skip is not None else (page - 1) * limit
    rows = (
        await db.execute(
            select(User).where(*conditions).order_by(User.id).offset(offset).limit(limit)
        )
    ).scalars().all()
    return PaginatedUsersResponse(
        total_users=total,
        total_pages=math.ceil(total / limit) if total else 0,
        page=(offset // limit) + 1,
        limit=limit,
        offset=offset,
        users=[UserResponse.model_validate(u) for u in rows],
    )


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> UserDetailResponse:
    user = await _get_user_or_404(user_id, db)
    projects_count = await db.scalar(
        select(func.count()).select_from(Project).where(Project.owner_id == user_id)
    )
    tasks_count = await db.scalar(
        select(func.count()).select_from(Task).where(Task.created_by_id == user_id)
    )
    eff = await get_effective_limits(db, user_id)
    return UserDetailResponse(
        user=UserResponse.model_validate(user),
        projects_count=projects_count or 0,
        tasks_count=tasks_count or 0,
        effective_max_projects=eff.max_projects,
        effective_max_tasks=eff.max_tasks,
        effective_max_tasks_per_project=eff.max_tasks_per_project,
    )


async def _set_active(user_id: int, active: bool, current: User, db: AsyncSession) -> User:
    user = await _get_user_or_404(user_id, db)
    if active:
        if user.deleted_at is not None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "A deleted account cannot be re-activated"
            )
    else:
        if user.id == current.id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "An admin cannot deactivate their own account"
            )
        if await _is_last_active_admin(user, db):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Cannot deactivate the last active admin"
            )
    user.is_active = active
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}/status", response_model=UserResponse)
async def set_user_status(
    user_id: int,
    data: UserStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
) -> User:
    return await _set_active(user_id, data.is_active, current_user, db)


@router.patch("/users/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
) -> User:
    return await _set_active(user_id, False, current_user, db)


@router.patch("/users/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
) -> User:
    return await _set_active(user_id, True, current_user, db)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
) -> Response:
    if user_id == current_user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An admin cannot delete their own account")
    user = await db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if await _is_last_active_admin(user, db):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete the last active admin")
    # Soft delete: their projects/tasks must survive
    await soft_delete_user(user, db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------- per-user quota overrides
def _limits_out(user_id: int, row: UserLimit | None) -> UserLimitsResponse:
    return UserLimitsResponse(
        user_id=user_id,
        max_projects=row.max_projects if row else None,
        max_tasks=row.max_tasks if row else None,
        max_tasks_per_project=row.max_tasks_per_project if row else None,
    )


@router.put("/users/{user_id}/limits", response_model=UserLimitsResponse)
async def set_user_limits(
    user_id: int,
    data: UserLimitsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> UserLimitsResponse:
    await _get_user_or_404(user_id, db)
    row = await get_user_limit_row(db, user_id)
    if row is None:
        row = UserLimit(user_id=user_id)
        db.add(row)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(row, field, value)  # explicit null = fall back to the global default
    await db.commit()
    await db.refresh(row)
    return _limits_out(user_id, row)


@router.delete("/users/{user_id}/limits")
async def reset_user_limits(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> dict:
    await _get_user_or_404(user_id, db)
    row = await get_user_limit_row(db, user_id)
    if row is not None:
        await db.delete(row)
        await db.commit()
    return {"message": "User limits reset to global defaults"}


# --------------------------------------------------------- global settings
def _settings_out(limits: SystemLimit) -> SystemSettingsResponse:
    return SystemSettingsResponse(
        id=limits.id,
        default_max_projects_per_user=limits.max_projects_per_user,
        default_max_tasks_per_user=limits.max_tasks_per_user,
        default_max_tasks_per_project=limits.max_tasks_per_project,
    )


@router.get("/settings", response_model=SystemSettingsResponse)
async def read_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> SystemSettingsResponse:
    return _settings_out(await get_limits(db))


@router.put("/settings", response_model=SystemSettingsResponse)
async def update_settings(
    data: SystemSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> SystemSettingsResponse:
    limits = await get_limits(db)
    mapping = {
        "default_max_projects_per_user": "max_projects_per_user",
        "default_max_tasks_per_user": "max_tasks_per_user",
        "default_max_tasks_per_project": "max_tasks_per_project",
    }
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(limits, mapping[field], value)
    await db.commit()
    await db.refresh(limits)
    return _settings_out(limits)


# Original limits endpoints kept for backward compatibility (Swagger/tests)
@router.get("/limits", response_model=SystemLimitResponse)
async def read_limits(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> SystemLimit:
    return await get_limits(db)


@router.put("/limits", response_model=SystemLimitResponse)
async def update_limits(
    data: SystemLimitUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
) -> SystemLimit:
    limits = await get_limits(db)
    for field, value in data.model_dump().items():
        setattr(limits, field, value)
    await db.commit()
    await db.refresh(limits)
    return limits
