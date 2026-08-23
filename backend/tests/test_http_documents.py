import io
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import delete

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
from app.documents.models import AuditLog
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
async def student_token(client, db_session):
    user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("clave-real-123"),
        full_name="Estudiante Test",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    login = await client.post(
        "/auth/login", json={"email": user.email, "password": "clave-real-123"}
    )
    token = login.json()["access_token"]
    yield token

    await db_session.execute(delete(AuditLog).where(AuditLog.user_id == user.id))
    await db_session.commit()
    await db_session.delete(user)
    await db_session.commit()


def _png_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (5, 5), color="white").save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.mark.asyncio
async def test_document_crud_without_file(client, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}

    create = await client.post("/documents", headers=headers, json={"title": "Acta de prueba"})
    assert create.status_code == 201
    doc_id = create.json()["id"]
    assert create.json()["status"] == "pending"

    get_resp = await client.get(f"/documents/{doc_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["original_image"] is None

    update = await client.patch(
        f"/documents/{doc_id}", headers=headers, json={"title": "Acta actualizada"}
    )
    assert update.status_code == 200
    assert update.json()["title"] == "Acta actualizada"

    listing = await client.get("/documents", headers=headers)
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1

    delete = await client.delete(f"/documents/{doc_id}", headers=headers)
    assert delete.status_code == 204

    get_after_delete = await client.get(f"/documents/{doc_id}", headers=headers)
    assert get_after_delete.status_code == 404


@pytest.mark.asyncio
async def test_upload_document_with_file_in_one_step(client, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}

    response = await client.post(
        "/documents/upload",
        headers=headers,
        data={"title": "Certificado escaneado"},
        files={"file": ("foto.png", _png_bytes(), "image/png")},
    )

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "pending"
    doc_id = body["document_id"]

    detail = await client.get(f"/documents/{doc_id}", headers=headers)
    assert detail.json()["original_image"]["file_format"] == "png"

    await client.delete(f"/documents/{doc_id}", headers=headers)


@pytest.mark.asyncio
async def test_upload_rejects_disallowed_extension(client, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}

    response = await client.post(
        "/documents/upload",
        headers=headers,
        data={"title": "Archivo invalido"},
        files={"file": ("virus.exe", b"contenido", "application/octet-stream")},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_register_then_upload_separately(client, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}

    create = await client.post("/documents", headers=headers, json={"title": "Sin archivo aun"})
    doc_id = create.json()["id"]

    upload = await client.post(
        f"/documents/{doc_id}/upload",
        headers=headers,
        files={"file": ("foto.png", _png_bytes(), "image/png")},
    )
    assert upload.status_code == 202

    second_upload = await client.post(
        f"/documents/{doc_id}/upload",
        headers=headers,
        files={"file": ("otra.png", _png_bytes(), "image/png")},
    )
    assert second_upload.status_code == 409

    await client.delete(f"/documents/{doc_id}", headers=headers)


@pytest.mark.asyncio
async def test_documents_endpoint_requires_authentication(client):
    response = await client.get("/documents")

    assert response.status_code == 401
