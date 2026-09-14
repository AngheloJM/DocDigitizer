import uuid

import pytest

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
from app.documents.schemas import DocumentCreate
from app.documents.service import create_document
from app.worker.tasks import MissingOriginalImageError, _mark_document_failed, _process_document


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


@pytest.mark.asyncio
async def test_process_document_does_not_set_failed_status_itself(db_session, test_user):
    """_process_document solo propaga el error; quien decide marcar 'failed' es el task de Celery
    (para no pisar el estado mientras todavia quedan reintentos pendientes)."""
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Sin archivo"))

    with pytest.raises(MissingOriginalImageError):
        await _process_document(document.id)

    await db_session.refresh(document)
    assert document.status == "processing"
    assert document.error_message is None

    await db_session.delete(document)
    await db_session.commit()


@pytest.mark.asyncio
async def test_mark_document_failed_stores_error_message(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Sin archivo"))

    await _mark_document_failed(document.id, "El documento no tiene un archivo original asociado")

    await db_session.refresh(document)
    assert document.status == "failed"
    assert document.error_message == "El documento no tiene un archivo original asociado"

    await db_session.delete(document)
    await db_session.commit()


@pytest.mark.asyncio
async def test_mark_document_failed_without_message_clears_it(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Sin archivo"))

    await _mark_document_failed(document.id)

    await db_session.refresh(document)
    assert document.status == "failed"
    assert document.error_message is None

    await db_session.delete(document)
    await db_session.commit()
