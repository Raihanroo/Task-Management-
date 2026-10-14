from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.deps import get_current_user
from core.users import soft_delete_user
from db import get_db
from models import User

router = APIRouter(prefix="/users", tags=["Users"])


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Self-delete. Owned projects and their tasks are kept."""
    if current_user.role == "admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Admin accounts cannot delete themselves")
    await soft_delete_user(current_user, db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
