import uuid

import pytest

from app.auth.models import User
from app.auth.service import create_refresh_token, hash_password, rotate_refresh_token
from app.database import SessionLocal


@pytest.fixture
async def db_session():
    async with SessionLocal() as session:
        yield session


@pytest.fixture
async def test_user(db_session):
    user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Usuario de Test",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    yield user
    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_rotate_refresh_token_returns_user_id(test_user):
    token = await create_refresh_token(test_user.id)

    user_id = await rotate_refresh_token(token)

    assert user_id == test_user.id


@pytest.mark.asyncio
async def test_refresh_token_is_single_use(test_user):
    token = await create_refresh_token(test_user.id)

    await rotate_refresh_token(token)
    second_attempt = await rotate_refresh_token(token)

    assert second_attempt is None


@pytest.mark.asyncio
async def test_unknown_refresh_token_returns_none():
    result = await rotate_refresh_token("token-que-no-existe")

    assert result is None
