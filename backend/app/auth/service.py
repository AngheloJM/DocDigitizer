import uuid
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.permissions import roles_creatable_by
from app.auth.schemas import UserCreate
from app.config import get_settings
from app.redis_client import get_redis_client

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 900


class TooManyLoginAttemptsError(Exception):
    pass


class InvalidRoleAssignmentError(Exception):
    pass


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        return uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, creator: User, data: UserCreate) -> User:
    allowed_roles = roles_creatable_by(creator)
    if data.role not in allowed_roles:
        raise InvalidRoleAssignmentError(
            f"No tienes permisos para crear usuarios con rol '{data.role}'"
        )

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _login_attempts_key(email: str) -> str:
    return f"login_attempts:{email.lower()}"


async def check_login_rate_limit(email: str) -> None:
    redis = get_redis_client()
    attempts = await redis.get(_login_attempts_key(email))
    if attempts is not None and int(attempts) >= MAX_LOGIN_ATTEMPTS:
        raise TooManyLoginAttemptsError(
            f"Demasiados intentos fallidos. Intenta de nuevo en {LOGIN_LOCKOUT_SECONDS // 60} minutos."
        )


async def record_failed_login(email: str) -> None:
    redis = get_redis_client()
    key = _login_attempts_key(email)
    attempts = await redis.incr(key)
    if attempts == 1:
        await redis.expire(key, LOGIN_LOCKOUT_SECONDS)


async def reset_login_attempts(email: str) -> None:
    redis = get_redis_client()
    await redis.delete(_login_attempts_key(email))


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    user = await get_user_by_email(db, email)
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user
