import uuid

import pytest
from fastapi import HTTPException

from app.documents import router as documents_router
from app.rate_limit import RateLimitExceededError


@pytest.mark.asyncio
async def test_enforce_reprocess_rate_limit_uses_dedicated_key(monkeypatch):
    captured = {}

    async def _fake_enforce_rate_limit(key, max_attempts, window_seconds):
        captured["key"] = key
        captured["max_attempts"] = max_attempts
        captured["window_seconds"] = window_seconds

    monkeypatch.setattr(documents_router, "enforce_rate_limit", _fake_enforce_rate_limit)

    user_id = uuid.uuid4()
    await documents_router._enforce_reprocess_rate_limit(user_id)

    assert captured["key"] == f"reprocess_rate:{user_id}"
    assert captured["max_attempts"] == documents_router.REPROCESS_MAX_ATTEMPTS
    assert captured["window_seconds"] == documents_router.REPROCESS_WINDOW_SECONDS


@pytest.mark.asyncio
async def test_enforce_reprocess_rate_limit_raises_429_when_exceeded(monkeypatch):
    async def _fake_enforce_rate_limit(*_args, **_kwargs):
        raise RateLimitExceededError("limite alcanzado")

    monkeypatch.setattr(documents_router, "enforce_rate_limit", _fake_enforce_rate_limit)

    with pytest.raises(HTTPException) as exc_info:
        await documents_router._enforce_reprocess_rate_limit(uuid.uuid4())

    assert exc_info.value.status_code == 429
