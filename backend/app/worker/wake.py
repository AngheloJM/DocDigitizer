import logging

import httpx

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


async def wake_worker() -> None:
    if not settings.worker_wake_url:
        return

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.get(settings.worker_wake_url)
    except httpx.HTTPError:
        logger.warning("No se pudo despertar al worker en %s", settings.worker_wake_url, exc_info=True)
