from fastapi import APIRouter, HTTPException, status

from app.auth import service
from app.auth.permissions import is_staff
from app.auth.schemas import LoginRequest, RefreshRequest, TokenResponse, UserCreate, UserResponse
from app.auth.service import InvalidEmailDomainError, InvalidRoleAssignmentError, TooManyLoginAttemptsError
from app.config import get_settings
from app.dependencies import CurrentUser, DbSession

router = APIRouter()
settings = get_settings()


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(data: UserCreate, db: DbSession, current_user: CurrentUser):
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para crear usuarios",
        )

    existing = await service.get_user_by_email(db, data.email)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El email ya está registrado")

    try:
        return await service.create_user(db, current_user, data)
    except InvalidRoleAssignmentError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    except InvalidEmailDomainError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: DbSession):
    try:
        await service.check_login_rate_limit(data.email)
    except TooManyLoginAttemptsError as error:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(error))

    user = await service.authenticate_user(db, data.email, data.password)
    if user is None:
        await service.record_failed_login(data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )

    await service.reset_login_attempts(data.email)
    access_token = service.create_access_token(user.id)
    refresh_token = await service.create_refresh_token(user.id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.jwt_expire_minutes * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: DbSession):
    user_id = await service.rotate_refresh_token(data.refresh_token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalido o expirado",
        )

    user = await service.get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalido o expirado",
        )

    access_token = service.create_access_token(user.id)
    new_refresh_token = await service.create_refresh_token(user.id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.jwt_expire_minutes * 60,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser):
    return current_user
