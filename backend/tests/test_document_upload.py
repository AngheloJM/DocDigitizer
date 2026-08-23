import io
import uuid

import pytest
from PIL import Image

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
from app.documents.schemas import DocumentCreate
from app.documents.service import (
    DocumentAlreadyHasFileError,
    InvalidFileError,
    attach_file_to_document,
    create_document,
    create_document_with_file,
    delete_document,
    get_document_relations,
)
from app.storage.minio_client import download_bytes

def _make_png_bytes(width: int = 3, height: int = 2) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color="white").save(buffer, format="PNG")
    return buffer.getvalue()


PNG_1X1_BYTES = _make_png_bytes()


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
async def test_create_document_with_file_uploads_to_minio(db_session, test_user):
    document = await create_document_with_file(
        db_session, test_user.id, DocumentCreate(title="Acta"), PNG_1X1_BYTES, "foto.png"
    )

    original_image, _, _ = await get_document_relations(db_session, document.id)
    assert original_image is not None
    assert original_image.file_format == "png"
    assert original_image.width_px == 3
    assert original_image.height_px == 2

    stored_bytes = download_bytes("originals", original_image.minio_path)
    assert stored_bytes == PNG_1X1_BYTES

    await delete_document(db_session, document)


@pytest.mark.asyncio
async def test_attach_file_rejects_disallowed_extension(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Acta"))

    with pytest.raises(InvalidFileError):
        await attach_file_to_document(db_session, document, b"contenido", "virus.exe")

    await db_session.delete(document)
    await db_session.commit()


@pytest.mark.asyncio
async def test_attach_file_rejects_oversized_file(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Acta"))
    oversized = b"0" * (20 * 1024 * 1024 + 1)

    with pytest.raises(InvalidFileError):
        await attach_file_to_document(db_session, document, oversized, "grande.png")

    await db_session.delete(document)
    await db_session.commit()


@pytest.mark.asyncio
async def test_cannot_attach_file_twice(db_session, test_user):
    document = await create_document_with_file(
        db_session, test_user.id, DocumentCreate(title="Acta"), PNG_1X1_BYTES, "foto.png"
    )

    with pytest.raises(DocumentAlreadyHasFileError):
        await attach_file_to_document(db_session, document, PNG_1X1_BYTES, "otra.png")

    await delete_document(db_session, document)


@pytest.mark.asyncio
async def test_delete_document_removes_file_from_minio(db_session, test_user):
    document = await create_document_with_file(
        db_session, test_user.id, DocumentCreate(title="Acta"), PNG_1X1_BYTES, "foto.png"
    )
    original_image, _, _ = await get_document_relations(db_session, document.id)
    minio_path = original_image.minio_path

    await delete_document(db_session, document)

    with pytest.raises(Exception):
        download_bytes("originals", minio_path)
