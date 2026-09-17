import uuid

import pytest

from app.auth.models import User
from app.auth.service import (
    blacklist_access_token,
    create_access_token,
    create_refresh_token,
    decode_access_token_claims,
    hash_password,
    is_access_token_blacklisted,
    revoke_all_sessions,
    rotate_refresh_token,
)
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
async def test_access_token_is_not_blacklisted_by_default(test_user):
    token = await create_access_token(test_user.id)
    claims = decode_access_token_claims(token)

    assert await is_access_token_blacklisted(claims["jti"]) is False


@pytest.mark.asyncio
async def test_blacklist_access_token_marks_its_jti(test_user):
    token = await create_access_token(test_user.id)
    claims = decode_access_token_claims(token)

    await blacklist_access_token(token)

    assert await is_access_token_blacklisted(claims["jti"]) is True


@pytest.mark.asyncio
async def test_is_access_token_blacklisted_handles_missing_jti():
    assert await is_access_token_blacklisted(None) is False


@pytest.mark.asyncio
async def test_revoke_all_sessions_invalidates_refresh_tokens(test_user):
    token_a = await create_refresh_token(test_user.id)
    token_b = await create_refresh_token(test_user.id)

    await revoke_all_sessions(test_user.id)

    assert await rotate_refresh_token(token_a) is None
    assert await rotate_refresh_token(token_b) is None


@pytest.mark.asyncio
async def test_revoke_all_sessions_blacklists_issued_access_tokens(test_user):
    token_a = await create_access_token(test_user.id)
    token_b = await create_access_token(test_user.id)
    claims_a = decode_access_token_claims(token_a)
    claims_b = decode_access_token_claims(token_b)

    await revoke_all_sessions(test_user.id)

    assert await is_access_token_blacklisted(claims_a["jti"]) is True
    assert await is_access_token_blacklisted(claims_b["jti"]) is True


@pytest.mark.asyncio
async def test_revoke_all_sessions_does_not_affect_other_users(db_session, test_user):
    other_user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Otro Usuario",
    )
    db_session.add(other_user)
    await db_session.commit()
    await db_session.refresh(other_user)

    other_token = await create_refresh_token(other_user.id)
    await revoke_all_sessions(test_user.id)

    assert await rotate_refresh_token(other_token) == other_user.id

    await db_session.delete(other_user)
    await db_session.commit()
