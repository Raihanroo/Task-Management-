# routers/auth.py
# Authentication routes: /auth/register, /auth/login, /auth/me

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.deps import get_current_user
from db import get_db
from models import User
from schemas import (
    UserLogin,
    UserLoginResponse,
    UserRegister,
    UserRegisterResponse,
    UserResponse,
)
from core.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(user_data: UserRegister, db: AsyncSession = Depends(get_db)):
    """
    User registration:
    - username আলাদাভাবে check kora hoy already exist kina
    - email আলাদাভাবে check kora hoy already exist kina
    - duplicate paile 400 Bad Request + descriptive message
    - na thakle password hash kore notun user DB te save kora hoy
    """

    # 1) Username duplicate check
    result = await db.execute(select(User).where(User.username == user_data.username))
    existing_username = result.scalar_one_or_none()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username '{user_data.username}' is already taken. Please choose a different username.",
        )

    # 2) Email duplicate check
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_email = result.scalar_one_or_none()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{user_data.email}' is already registered. Please use a different email or log in.",
        )

    # 3) Password hash kora (pwdlib -> PasswordHash.recommended())
    hashed_password = hash_password(user_data.password)

    # 4) Notun user create -> DB te persist
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return new_user


@router.post(
    "/login",
    response_model=UserLoginResponse,
    status_code=status.HTTP_200_OK,
)
async def login(login_data: UserLogin, db: AsyncSession = Depends(get_db)):
    """
    User login:
    - username diye user khoja hoy
    - password ta stored hash er sathe verify kora hoy (pwdlib)
    - kono ekta bhul hole generic 401 Unauthorized (security best practice:
      username exist kina segula alada kore bola thik na)
    """

    result = await db.execute(select(User).where(User.username == login_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is temporarily banned",
        )

    return UserLoginResponse(
        message="Login successful.",
        id=user.id,
        username=user.username,
        email=user.email,
        access_token=create_access_token({"sub": str(user.id)}),
    )


@router.get("/me", response_model=UserResponse)
async def read_me(current_user: User = Depends(get_current_user)):
    """Logged-in user er profile (frontend session load er jonno)."""
    return current_user
