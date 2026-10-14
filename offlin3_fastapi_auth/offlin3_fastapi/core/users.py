import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from models import User


async def soft_delete_user(user: User, db: AsyncSession) -> None:
    """Delete an account without breaking projects/tasks.

    The row is kept so Project.owner_id, Task.assigned_to_id, Task.created_by_id
    and ProjectMember rows still point at a valid user. Login is impossible
    afterwards and the username/email are freed for re-registration.
    """
    tag = f"{user.id}_{uuid.uuid4().hex[:8]}"
    user.username = f"deleted_{tag}"
    user.email = f"deleted_{tag}@deleted.invalid"
    user.hashed_password = "!"  # not a valid hash -> can never verify
    user.is_active = False
    user.deleted_at = datetime.now(timezone.utc)
    await db.commit()
