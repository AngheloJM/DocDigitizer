import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy import select

from app.auth import models as auth_models  # noqa: F401
from app.config import get_settings
from app.database import SessionLocal, engine
from app.documents.models import Document, ExtractedText, GeneratedPdf, OriginalImage
from app.folders import models as folders_models  # noqa: F401
from app.processing.pipeline import process_image_bytes
from app.storage.minio_client import download_bytes, upload_bytes
from app.worker.celery_app import TASK_SOFT_TIME_LIMIT_SECONDS, celery_app

settings = get_settings()
logger = logging.getLogger(__name__)

PROCESS_DOCUMENT_MAX_RETRIES = 3
PROCESS_DOCUMENT_RETRY_BACKOFF_SECONDS = 30

# Debe ser bastante mayor que TASK_SOFT_TIME_LIMIT_SECONDS + los reintentos internos de
# process_document, para no reencolar una tarea que en realidad sigue viva y trabajando.
STUCK_PROCESSING_THRESHOLD_MINUTES = 20


class MissingOriginalImageError(RuntimeError):
    """El documento no tiene un archivo original: reintentar no lo va a arreglar."""


def _should_give_up(retries: int, max_retries: int) -> bool:
    return retries >= max_retries


def _retry_countdown(retries: int) -> int:
    return PROCESS_DOCUMENT_RETRY_BACKOFF_SECONDS * (2**retries)


@celery_app.task(name="app.worker.tasks.ping")
def ping() -> str:
    return "pong"


async def _process_document(document_id: uuid.UUID) -> None:
    async with SessionLocal() as db:
        document = await db.get(Document, document_id)
        if document is None:
            return

        document.status = "processing"
        document.error_message = None
        await db.commit()

        try:
            original_image = (
                await db.execute(
                    select(OriginalImage).where(OriginalImage.document_id == document_id)
                )
            ).scalar_one_or_none()
            if original_image is None:
                raise MissingOriginalImageError("El documento no tiene un archivo original asociado")

            logger.info("document=%s downloading original", document_id)
            image_bytes = download_bytes(settings.minio_bucket_originals, original_image.minio_path)

            logger.info("document=%s running pipeline", document_id)
            result = process_image_bytes(image_bytes, original_image.file_format)

            pdf_path = f"processed/{document.user_id}/{document.id}.pdf"
            logger.info("document=%s uploading processed pdf", document_id)
            upload_bytes(
                settings.minio_bucket_processed, pdf_path, result["pdf_bytes"], "application/pdf"
            )

            existing_versions = (
                await db.execute(select(GeneratedPdf).where(GeneratedPdf.document_id == document_id))
            ).scalars().all()

            db.add(
                GeneratedPdf(
                    document_id=document_id,
                    minio_path=pdf_path,
                    version=len(existing_versions) + 1,
                    file_size_bytes=len(result["pdf_bytes"]),
                )
            )

            existing_text = (
                await db.execute(select(ExtractedText).where(ExtractedText.document_id == document_id))
            ).scalar_one_or_none()

            ocr = result["ocr_result"]
            if existing_text is not None:
                existing_text.raw_text = ocr["raw_text"]
                existing_text.ocr_confidence = ocr["ocr_confidence"]
                existing_text.ocr_engine = ocr["ocr_engine"]
                existing_text.word_count = ocr["word_count"]
            else:
                db.add(
                    ExtractedText(
                        document_id=document_id,
                        raw_text=ocr["raw_text"],
                        ocr_confidence=ocr["ocr_confidence"],
                        ocr_engine=ocr["ocr_engine"],
                        word_count=ocr["word_count"],
                    )
                )

            document.status = "completed"
            document.processed_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception:
            logger.exception("document=%s fallo el procesamiento", document_id)
            await db.rollback()
            raise


async def _mark_document_failed(document_id: uuid.UUID, error_message: str | None = None) -> None:
    async with SessionLocal() as db:
        document = await db.get(Document, document_id)
        if document is None:
            return
        document.status = "failed"
        document.error_message = error_message[:2000] if error_message else None
        await db.commit()


async def _process_document_and_dispose(document_id: uuid.UUID) -> None:
    try:
        await _process_document(document_id)
    finally:
        await engine.dispose()


async def _mark_document_failed_and_dispose(document_id: uuid.UUID, error_message: str | None = None) -> None:
    try:
        await _mark_document_failed(document_id, error_message)
    finally:
        await engine.dispose()


@celery_app.task(name="app.worker.tasks.process_document", bind=True, max_retries=PROCESS_DOCUMENT_MAX_RETRIES)
def process_document(self, document_id: str) -> None:
    try:
        asyncio.run(_process_document_and_dispose(uuid.UUID(document_id)))
    except MissingOriginalImageError as exc:
        asyncio.run(_mark_document_failed_and_dispose(uuid.UUID(document_id), str(exc)))
        raise
    except (Exception, SoftTimeLimitExceeded) as exc:
        # SoftTimeLimitExceeded hereda de SystemExit, no de Exception, precisamente para
        # que no quede atrapada por accidente en un "except Exception" generico. Aca la
        # queremos tratar igual que cualquier otra falla: reintentar y, si se agotan los
        # reintentos, marcar el documento como failed en vez de dejarlo colgado.
        if isinstance(exc, SoftTimeLimitExceeded):
            exc = TimeoutError(
                f"El procesamiento supero el limite de {TASK_SOFT_TIME_LIMIT_SECONDS // 60} minutos"
            )
        if _should_give_up(self.request.retries, self.max_retries):
            logger.error("document=%s agoto los reintentos, marcando como failed", document_id)
            asyncio.run(_mark_document_failed_and_dispose(uuid.UUID(document_id), str(exc)))
            raise
        countdown = _retry_countdown(self.request.retries)
        logger.warning(
            "document=%s reintento %s/%s en %ss",
            document_id,
            self.request.retries + 1,
            self.max_retries,
            countdown,
        )
        raise self.retry(exc=exc, countdown=countdown)


async def _find_stuck_document_ids(threshold_minutes: int) -> list[uuid.UUID]:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=threshold_minutes)
    async with SessionLocal() as db:
        result = await db.execute(
            select(Document.id).where(Document.status == "processing", Document.updated_at < cutoff)
        )
        return [row[0] for row in result.all()]


@celery_app.task(name="app.worker.tasks.requeue_stuck_documents")
def requeue_stuck_documents() -> int:
    """Tarea periodica (Celery Beat): busca documentos que quedaron en 'processing' sin
    ningun avance por mas de STUCK_PROCESSING_THRESHOLD_MINUTES -- senal de que el worker
    se colgo o murio a mitad de la tarea sin que nada lo detectara -- y los vuelve a
    encolar. process_document ya es idempotente ante una re-ejecucion."""
    stuck_ids = asyncio.run(_find_stuck_document_ids(STUCK_PROCESSING_THRESHOLD_MINUTES))
    for document_id in stuck_ids:
        logger.warning("document=%s colgado en processing, reencolando", document_id)
        process_document.delay(str(document_id))
    return len(stuck_ids)
