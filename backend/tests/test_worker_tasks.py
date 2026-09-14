import io
import uuid

import pytest
from PIL import Image

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
from app.documents.schemas import DocumentCreate
from app.documents.service import attach_file_to_document, create_document, delete_document
from app.worker.tasks import (
    PROCESS_DOCUMENT_RETRY_BACKOFF_SECONDS,
    MissingOriginalImageError,
    _mark_document_failed,
    _process_document,
    _retry_countdown,
    _should_give_up,
)


def _make_png_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (5, 5), color="white").save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
async def db_session():
    async with SessionLocal() as session:
        yield session


@pytest.fixture
async def test_user(db_session):
    user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Usuario de Test",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    yield user
    await db_session.delete(user)
    await db_session.commit()


def test_should_give_up_only_after_exhausting_retries():
    assert _should_give_up(retries=0, max_retries=3) is False
    assert _should_give_up(retries=2, max_retries=3) is False
    assert _should_give_up(retries=3, max_retries=3) is True
    assert _should_give_up(retries=4, max_retries=3) is True


def test_retry_countdown_backs_off_exponentially():
    assert _retry_countdown(0) == PROCESS_DOCUMENT_RETRY_BACKOFF_SECONDS
    assert _retry_countdown(1) == PROCESS_DOCUMENT_RETRY_BACKOFF_SECONDS * 2
    assert _retry_countdown(2) == PROCESS_DOCUMENT_RETRY_BACKOFF_SECONDS * 4


@pytest.mark.asyncio
async def test_process_document_raises_missing_original_image_error(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Sin archivo"))

    with pytest.raises(MissingOriginalImageError):
        await _process_document(document.id)

    await db_session.delete(document)
    await db_session.commit()


@pytest.mark.asyncio
async def test_mark_document_failed_sets_status(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Con archivo"))
    await attach_file_to_document(db_session, document, _make_png_bytes(), "foto.png")

    await _mark_document_failed(document.id)

    await db_session.refresh(document)
    assert document.status == "failed"

    await delete_document(db_session, document)
