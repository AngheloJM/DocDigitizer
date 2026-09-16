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

TASK_SOFT_TIME_LIMIT_SECONDS = 600  # 10 minutos: se le avisa a la tarea para que se corte sola
TASK_HARD_TIME_LIMIT_SECONDS = 660  # 11 minutos: si ni asi corta, se mata el proceso hijo
STUCK_PROCESSING_CHECK_INTERVAL_SECONDS = 300  # cada 5 minutos se revisa si algo quedo colgado

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Por defecto Celery confirma (ack) una tarea apenas el worker la recibe, antes de
    # ejecutarla. En Render free tier el worker se reinicia seguido (deploys, sleep/wake),
    # y sin esto una tarea tomada justo antes de un reinicio se pierde para siempre: el
    # documento queda en 'pending' sin error y sin que nada la vuelva a encolar.
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Sin limite de tiempo, un archivo problematico puede colgar el pipeline de OCR
    # indefinidamente (paso una vez por ~1h50 sin que nada lo detectara). El limite
    # suave le da a la tarea la chance de terminar prolijo (ver SoftTimeLimitExceeded
    # en tasks.py); el duro es un respaldo si ni eso funciona. Requieren --pool=prefork
    # (con --concurrency=1): bajo --pool=solo no hay proceso hijo que Celery pueda matar.
    task_soft_time_limit=TASK_SOFT_TIME_LIMIT_SECONDS,
    task_time_limit=TASK_HARD_TIME_LIMIT_SECONDS,
    # Recicla el proceso hijo cada N tareas para no acumular fugas de memoria de
    # Tesseract/OpenCV entre documentos (tambien requiere --pool=prefork).
    worker_max_tasks_per_child=20,
    beat_schedule={
        "requeue-stuck-processing-documents": {
            "task": "app.worker.tasks.requeue_stuck_documents",
            "schedule": STUCK_PROCESSING_CHECK_INTERVAL_SECONDS,
        },
    },
)

broker_ssl_options = _ssl_options_if_needed(settings.celery_broker_url)
if broker_ssl_options is not None:
    celery_app.conf.broker_use_ssl = broker_ssl_options

backend_ssl_options = _ssl_options_if_needed(settings.celery_result_backend)
if backend_ssl_options is not None:
    celery_app.conf.redis_backend_use_ssl = backend_ssl_options
