import uuid

import pytest
from fastapi import HTTPException

from app.auth import router as auth_router
from app.documents import search_router
from app.rate_limit import RateLimitExceededError


@pytest.mark.asyncio
async def test_user_management_rate_limit_uses_dedicated_key(monkeypatch):
    captured = {}

    async def _fake_enforce_rate_limit(key, max_attempts, window_seconds):
        captured["key"] = key
        captured["max_attempts"] = max_attempts
        captured["window_seconds"] = window_seconds

    monkeypatch.setattr(auth_router, "enforce_rate_limit", _fake_enforce_rate_limit)

    user_id = uuid.uuid4()
    await auth_router._enforce_user_management_rate_limit(user_id)

    assert captured["key"] == f"user_admin_rate:{user_id}"
    assert captured["max_attempts"] == auth_router.USER_MANAGEMENT_MAX_ATTEMPTS
    assert captured["window_seconds"] == auth_router.USER_MANAGEMENT_WINDOW_SECONDS


@pytest.mark.asyncio
async def test_user_management_rate_limit_raises_429_when_exceeded(monkeypatch):
    async def _fake_enforce_rate_limit(*_args, **_kwargs):
        raise RateLimitExceededError("limite alcanzado")

    monkeypatch.setattr(auth_router, "enforce_rate_limit", _fake_enforce_rate_limit)

    with pytest.raises(HTTPException) as exc_info:
        await auth_router._enforce_user_management_rate_limit(uuid.uuid4())

    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_search_endpoint_enforces_rate_limit(monkeypatch):
    captured = {}

    async def _fake_enforce_rate_limit(key, max_attempts, window_seconds):
        captured["key"] = key
        raise RateLimitExceededError("limite alcanzado")

    monkeypatch.setattr(search_router, "enforce_rate_limit", _fake_enforce_rate_limit)

    class _FakeUser:
        id = uuid.uuid4()

    with pytest.raises(HTTPException) as exc_info:
        await search_router.search_documents(db=None, current_user=_FakeUser(), q="acta")

    assert exc_info.value.status_code == 429
    assert captured["key"] == f"search_rate:{_FakeUser.id}"
