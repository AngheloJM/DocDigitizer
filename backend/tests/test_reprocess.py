import io
import uuid

import pytest
from PIL import Image

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
from app.documents.schemas import DocumentCreate
from app.documents.service import (
    NoOriginalFileError,
    attach_file_to_document,
    create_document,
    delete_document,
    mark_document_for_reprocessing,
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


@pytest.mark.asyncio
async def test_cannot_reprocess_document_without_file(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Sin archivo"))

    with pytest.raises(NoOriginalFileError):
        await mark_document_for_reprocessing(db_session, document)

    await db_session.delete(document)
    await db_session.commit()


@pytest.mark.asyncio
async def test_reprocess_sets_status(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Con archivo"))
    await attach_file_to_document(db_session, document, _make_png_bytes(), "foto.png")

    updated = await mark_document_for_reprocessing(db_session, document)

    assert updated.status == "reprocessing"

    await delete_document(db_session, document)
