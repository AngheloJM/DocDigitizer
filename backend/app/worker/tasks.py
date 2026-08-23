import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.auth import models as auth_models  # noqa: F401
from app.config import get_settings
from app.database import SessionLocal, engine
from app.documents.models import Document, ExtractedText, GeneratedPdf, OriginalImage
from app.folders import models as folders_models  # noqa: F401
from app.processing.pipeline import process_image_bytes
from app.storage.minio_client import download_bytes, upload_bytes
from app.worker.celery_app import celery_app

settings = get_settings()


@celery_app.task(name="app.worker.tasks.ping")
def ping() -> str:
    return "pong"


async def _process_document(document_id: uuid.UUID) -> None:
    async with SessionLocal() as db:
        document = await db.get(Document, document_id)
        if document is None:
            return

        document.status = "processing"
        await db.commit()

        try:
            original_image = (
                await db.execute(
                    select(OriginalImage).where(OriginalImage.document_id == document_id)
                )
            ).scalar_one_or_none()
            if original_image is None:
                raise RuntimeError("El documento no tiene un archivo original asociado")

            image_bytes = download_bytes(settings.minio_bucket_originals, original_image.minio_path)
            result = process_image_bytes(image_bytes, original_image.file_format)

            pdf_path = f"{document.user_id}/{document.id}.pdf"
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
            await db.rollback()
            document.status = "failed"
            await db.commit()
            raise


async def _process_document_and_dispose(document_id: uuid.UUID) -> None:
    try:
        await _process_document(document_id)
    finally:
        await engine.dispose()


@celery_app.task(name="app.worker.tasks.process_document")
def process_document(document_id: str) -> None:
    asyncio.run(_process_document_and_dispose(uuid.UUID(document_id)))
