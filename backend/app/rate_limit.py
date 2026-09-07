from app.redis_client import get_redis_client


class RateLimitExceededError(Exception):
    pass


async def enforce_rate_limit(key: str, max_attempts: int, window_seconds: int) -> None:
    redis = get_redis_client()
    attempts = await redis.incr(key)
    if attempts == 1:
        await redis.expire(key, window_seconds)
    if attempts > max_attempts:
        raise RateLimitExceededError(
            f"Demasiadas solicitudes. Intenta de nuevo en {window_seconds // 60} minutos."
        )
