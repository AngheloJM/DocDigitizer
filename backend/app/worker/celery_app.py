import ssl

from celery import Celery

from app.config import get_settings

settings = get_settings()


def _ssl_options_if_needed(url: str) -> dict | None:
    """rediss:// (Redis con TLS, como Upstash) exige indicarle a Celery como validar
    el certificado del servidor; sin esto, tanto el broker como el backend de
    resultados fallan con "A rediss:// URL must have parameter ssl_cert_reqs" apenas
    se intenta usar."""
    if not url.startswith("rediss://"):
        return None
    return {"ssl_cert_reqs": ssl.CERT_REQUIRED}


celery_app = Celery(
    "docdigitizer",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

broker_ssl_options = _ssl_options_if_needed(settings.celery_broker_url)
if broker_ssl_options is not None:
    celery_app.conf.broker_use_ssl = broker_ssl_options

backend_ssl_options = _ssl_options_if_needed(settings.celery_result_backend)
if backend_ssl_options is not None:
    celery_app.conf.redis_backend_use_ssl = backend_ssl_options
