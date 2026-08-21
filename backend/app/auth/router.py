from fastapi import APIRouter, HTTPException, status

from app.auth import service
from app.auth.permissions import is_staff
from app.auth.schemas import LoginRequest, TokenResponse, UserCreate, UserResponse
from app.auth.service import InvalidRoleAssignmentError, TooManyLoginAttemptsError
from app.dependencies import CurrentUser, DbSession

router = APIRouter()


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
    token = service.create_access_token(user.id)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser):
    return current_user
