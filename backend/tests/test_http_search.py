import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
from app.documents.models import AuditLog, Document, ExtractedText
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as ac:
        yield ac


@pytest.fixture
async def db_session():
    async with SessionLocal() as session:
        yield session


@pytest.fixture
async def student_with_document(client, db_session):
    user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("clave-real-123"),
        full_name="Estudiante Test",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    document = Document(title="Acta con texto", user_id=user.id, status="completed")
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    extracted = ExtractedText(
        document_id=document.id,
        raw_text="certificado de calificaciones del estudiante",
        ocr_confidence=90.0,
        ocr_engine="tesseract",
        word_count=6,
    )
    db_session.add(extracted)
    await db_session.commit()

    login = await client.post(
        "/auth/login", json={"email": user.email, "password": "clave-real-123"}
    )
    token = login.json()["access_token"]

    yield token, document.id

    await db_session.execute(delete(AuditLog).where(AuditLog.user_id == user.id))
    await db_session.execute(delete(ExtractedText).where(ExtractedText.document_id == document.id))
    await db_session.execute(delete(Document).where(Document.id == document.id))
    await db_session.commit()
    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_search_finds_document_via_http(client, student_with_document):
    token, document_id = student_with_document
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get("/search", headers=headers, params={"q": "certificado calificaciones"})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["document"]["id"] == str(document_id)
    assert "<b>" in body["items"][0]["highlight"]


@pytest.mark.asyncio
async def test_search_requires_query_param(client, student_with_document):
    token, _ = student_with_document
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get("/search", headers=headers)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_search_requires_authentication(client):
    response = await client.get("/search", params={"q": "algo"})

    assert response.status_code == 401
