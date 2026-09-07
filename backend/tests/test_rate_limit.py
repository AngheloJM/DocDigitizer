import uuid

import pytest

from app.rate_limit import RateLimitExceededError, enforce_rate_limit


@pytest.mark.asyncio
async def test_enforce_rate_limit_allows_up_to_max_attempts():
    key = f"test_rate_limit:{uuid.uuid4()}"

    for _ in range(3):
        await enforce_rate_limit(key, max_attempts=3, window_seconds=60)


@pytest.mark.asyncio
async def test_enforce_rate_limit_blocks_after_max_attempts():
    key = f"test_rate_limit:{uuid.uuid4()}"

    for _ in range(3):
        await enforce_rate_limit(key, max_attempts=3, window_seconds=60)

    with pytest.raises(RateLimitExceededError):
        await enforce_rate_limit(key, max_attempts=3, window_seconds=60)


@pytest.mark.asyncio
async def test_enforce_rate_limit_keys_are_independent():
    key_a = f"test_rate_limit:{uuid.uuid4()}"
    key_b = f"test_rate_limit:{uuid.uuid4()}"

    for _ in range(3):
        await enforce_rate_limit(key_a, max_attempts=3, window_seconds=60)

    await enforce_rate_limit(key_b, max_attempts=3, window_seconds=60)
