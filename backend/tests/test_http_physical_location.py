import uuid

import pytest
from httpx import ASGITransport, AsyncClient
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
async def admin_token(client, db_session):
    user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("clave-real-123"),
        full_name="Admin Test",
        role="admin",
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


@pytest.mark.asyncio
async def test_register_document_with_physical_location_no_scan(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}

    create = await client.post(
        "/documents",
        headers=headers,
        json={
            "title": "Acta 2020 - Tomo III",
            "physical_shelf": "3",
            "physical_division": "B",
            "physical_column": "2",
            "physical_volume": "III",
        },
    )

    assert create.status_code == 201
    body = create.json()
    assert body["physical_shelf"] == "3"
    assert body["physical_division"] == "B"
    assert body["status"] == "pending"

    detail = await client.get(f"/documents/{body['id']}", headers=headers)
    assert detail.json()["original_image"] is None
    assert detail.json()["physical_column"] == "2"

    await client.delete(f"/documents/{body['id']}", headers=headers)


@pytest.mark.asyncio
async def test_update_physical_location_after_creation(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}

    create = await client.post("/documents", headers=headers, json={"title": "Sin ubicacion aun"})
    doc_id = create.json()["id"]

    update = await client.patch(
        f"/documents/{doc_id}",
        headers=headers,
        json={"physical_shelf": "5", "physical_division": "A"},
    )

    assert update.status_code == 200
    assert update.json()["physical_shelf"] == "5"
    assert update.json()["physical_division"] == "A"

    await client.delete(f"/documents/{doc_id}", headers=headers)


@pytest.mark.asyncio
async def test_list_documents_filters_by_physical_shelf(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}

    doc_a = await client.post(
        "/documents", headers=headers, json={"title": "En estante 7", "physical_shelf": "7"}
    )
    doc_b = await client.post(
        "/documents", headers=headers, json={"title": "En estante 9", "physical_shelf": "9"}
    )

    listing = await client.get("/documents", headers=headers, params={"physical_shelf": "7"})

    assert listing.status_code == 200
    ids = [item["id"] for item in listing.json()["items"]]
    assert doc_a.json()["id"] in ids
    assert doc_b.json()["id"] not in ids

    await client.delete(f"/documents/{doc_a.json()['id']}", headers=headers)
    await client.delete(f"/documents/{doc_b.json()['id']}", headers=headers)
