import httpx

from app.config import get_settings

settings = get_settings()


async def wake_worker() -> None:
    if not settings.worker_wake_url:
        return

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.get(settings.worker_wake_url)
    except httpx.HTTPError:
        pass
