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


async def _make_user(db_session, role: str, password: str = "irrelevante123") -> User:
    user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password(password),
        full_name=f"Usuario {role}",
        role=role,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_login_with_valid_credentials_returns_tokens(client, db_session):
    user = await _make_user(db_session, "student", password="clave-real-123")

    response = await client.post(
        "/auth/login", json={"email": user.email, "password": "clave-real-123"}
    )

    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"

    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_login_with_wrong_password_returns_401(client, db_session):
    user = await _make_user(db_session, "student", password="clave-real-123")

    response = await client.post(
        "/auth/login", json={"email": user.email, "password": "clave-incorrecta"}
    )

    assert response.status_code == 401

    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_me_requires_authentication(client):
    response = await client.get("/auth/me")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_current_user_with_valid_token(client, db_session):
    user = await _make_user(db_session, "student", password="clave-real-123")
    login = await client.post(
        "/auth/login", json={"email": user.email, "password": "clave-real-123"}
    )
    token = login.json()["access_token"]

    response = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["email"] == user.email

    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_login_gets_rate_limited_after_repeated_failures(client, db_session):
    user = await _make_user(db_session, "student", password="clave-real-123")

    for _ in range(5):
        response = await client.post(
            "/auth/login", json={"email": user.email, "password": "incorrecta"}
        )
        assert response.status_code == 401

    blocked = await client.post(
        "/auth/login", json={"email": user.email, "password": "incorrecta"}
    )
    assert blocked.status_code == 429

    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_student_cannot_create_users(client, db_session):
    student = await _make_user(db_session, "student", password="clave-real-123")
    login = await client.post(
        "/auth/login", json={"email": student.email, "password": "clave-real-123"}
    )
    token = login.json()["access_token"]

    response = await client.post(
        "/auth/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": f"{uuid.uuid4()}@utepsa-test.edu.bo",
            "password": "password123",
            "full_name": "Alguien",
            "role": "student",
        },
    )

    assert response.status_code == 403

    await db_session.delete(student)
    await db_session.commit()


@pytest.mark.asyncio
async def test_super_admin_can_create_admin_via_http(client, db_session):
    super_admin = await _make_user(db_session, "super_admin", password="clave-real-123")
    login = await client.post(
        "/auth/login", json={"email": super_admin.email, "password": "clave-real-123"}
    )
    token = login.json()["access_token"]
    new_email = f"{uuid.uuid4()}@utepsa-test.edu.bo"

    response = await client.post(
        "/auth/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": new_email,
            "password": "password123",
            "full_name": "Nuevo Admin",
            "role": "admin",
        },
    )

    assert response.status_code == 201
    assert response.json()["role"] == "admin"

    from sqlalchemy import select

    created = (
        await db_session.execute(select(User).where(User.email == new_email))
    ).scalar_one()
    await db_session.delete(created)
    await db_session.delete(super_admin)
    await db_session.commit()
