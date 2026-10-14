from sqlalchemy.ext.asyncio import AsyncSession

from dataclasses import dataclass

from models import SystemLimit, UserLimit


async def get_limits(db: AsyncSession) -> SystemLimit:
    limits = await db.get(SystemLimit, 1)
    if limits is None:
        limits = SystemLimit(id=1)
        db.add(limits)
        await db.commit()
        await db.refresh(limits)
    return limits


@dataclass
class EffectiveLimits:
    max_projects: int
    max_tasks: int
    max_tasks_per_project: int


async def get_user_limit_row(db: AsyncSession, user_id: int) -> UserLimit | None:
    return await db.get(UserLimit, user_id)


async def get_effective_limits(db: AsyncSession, user_id: int) -> EffectiveLimits:
    """Per-user override if set, otherwise the global default."""
    base = await get_limits(db)
    row = await get_user_limit_row(db, user_id)
    return EffectiveLimits(
        max_projects=(row.max_projects if row and row.max_projects is not None else base.max_projects_per_user),
        max_tasks=(row.max_tasks if row and row.max_tasks is not None else base.max_tasks_per_user),
        max_tasks_per_project=(
            row.max_tasks_per_project
            if row and row.max_tasks_per_project is not None
            else base.max_tasks_per_project
        ),
    )
