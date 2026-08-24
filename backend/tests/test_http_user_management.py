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


async def _make_user(db_session, role: str) -> User:
    user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("clave-real-123"),
        full_name=f"Usuario {role}",
        role=role,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _login(client, user):
    login = await client.post(
        "/auth/login", json={"email": user.email, "password": "clave-real-123"}
    )
    return login.json()["access_token"]


async def _cleanup(db_session, *users):
    for user in users:
        await db_session.execute(delete(AuditLog).where(AuditLog.user_id == user.id))
    await db_session.commit()
    for user in users:
        await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_deactivated_user_cannot_login(client, db_session):
    super_admin = await _make_user(db_session, "super_admin")
    student = await _make_user(db_session, "student")
    token = await _login(client, super_admin)

    deactivate = await client.patch(
        f"/auth/users/{student.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_active": False},
    )
    assert deactivate.status_code == 200
    assert deactivate.json()["is_active"] is False

    blocked_login = await client.post(
        "/auth/login", json={"email": student.email, "password": "clave-real-123"}
    )
    assert blocked_login.status_code == 403

    await _cleanup(db_session, super_admin, student)


@pytest.mark.asyncio
async def test_admin_cannot_view_another_admin(client, db_session):
    admin = await _make_user(db_session, "admin")
    other_admin = await _make_user(db_session, "admin")
    token = await _login(client, admin)

    response = await client.get(
        f"/auth/users/{other_admin.id}", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 404

    await _cleanup(db_session, admin, other_admin)


@pytest.mark.asyncio
async def test_student_cannot_list_users(client, db_session):
    student = await _make_user(db_session, "student")
    token = await _login(client, student)

    response = await client.get("/auth/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403

    await _cleanup(db_session, student)
