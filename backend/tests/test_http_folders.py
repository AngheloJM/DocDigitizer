import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
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

    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_folder_crud_flow(client, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}

    create = await client.post("/folders", headers=headers, json={"name": "Semestre I"})
    assert create.status_code == 201
    folder_id = create.json()["id"]

    get_resp = await client.get(f"/folders/{folder_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Semestre I"

    update = await client.patch(
        f"/folders/{folder_id}", headers=headers, json={"name": "Semestre I - actualizado"}
    )
    assert update.status_code == 200
    assert update.json()["name"] == "Semestre I - actualizado"

    listing = await client.get("/folders", headers=headers)
    assert listing.status_code == 200
    assert any(f["id"] == folder_id for f in listing.json())

    delete = await client.delete(f"/folders/{folder_id}", headers=headers)
    assert delete.status_code == 204

    get_after_delete = await client.get(f"/folders/{folder_id}", headers=headers)
    assert get_after_delete.status_code == 404


@pytest.mark.asyncio
async def test_folder_rejects_moving_into_own_subfolder(client, student_token):
    headers = {"Authorization": f"Bearer {student_token}"}

    root = await client.post("/folders", headers=headers, json={"name": "Raiz"})
    root_id = root.json()["id"]
    child = await client.post(
        "/folders", headers=headers, json={"name": "Hijo", "parent_id": root_id}
    )
    child_id = child.json()["id"]

    response = await client.patch(
        f"/folders/{root_id}", headers=headers, json={"parent_id": child_id}
    )
    assert response.status_code == 400

    await client.delete(f"/folders/{child_id}", headers=headers)
    await client.delete(f"/folders/{root_id}", headers=headers)


@pytest.mark.asyncio
async def test_folders_endpoint_requires_authentication(client):
    response = await client.get("/folders")

    assert response.status_code == 401
