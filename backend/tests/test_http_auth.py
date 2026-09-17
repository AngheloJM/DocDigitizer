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


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(client, db_session):
    user = await _make_user(db_session, "student", password="clave-real-123")

    login = await client.post(
        "/auth/login", json={"email": user.email, "password": "clave-real-123"}
    )
    refresh_token = login.json()["refresh_token"]

    logout = await client.post("/auth/logout", json={"refresh_token": refresh_token})
    assert logout.status_code == 204

    refresh_attempt = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_attempt.status_code == 401

    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_logout_with_unknown_token_does_not_error(client):
    response = await client.post("/auth/logout", json={"refresh_token": "token-que-no-existe"})

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_refresh_gets_rate_limited_after_repeated_attempts(client):
    from app.auth.router import REFRESH_MAX_ATTEMPTS
    from app.redis_client import get_redis_client

    redis = get_redis_client()

    async def _clear_refresh_rate_limit_keys():
        async for key in redis.scan_iter(match="refresh_rate:*"):
            await redis.delete(key)

    await _clear_refresh_rate_limit_keys()
    try:
        for _ in range(REFRESH_MAX_ATTEMPTS):
            response = await client.post(
                "/auth/refresh", json={"refresh_token": "token-que-no-existe"}
            )
            assert response.status_code == 401

        blocked = await client.post(
            "/auth/refresh", json={"refresh_token": "token-que-no-existe"}
        )
        assert blocked.status_code == 429
    finally:
        await _clear_refresh_rate_limit_keys()


@pytest.mark.asyncio
async def test_logout_with_bearer_token_blacklists_access_token(client, db_session):
    user = await _make_user(db_session, "student", password="clave-real-123")

    login = await client.post(
        "/auth/login", json={"email": user.email, "password": "clave-real-123"}
    )
    access_token = login.json()["access_token"]
    refresh_token = login.json()["refresh_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    still_valid = await client.get("/auth/me", headers=headers)
    assert still_valid.status_code == 200

    logout = await client.post(
        "/auth/logout", json={"refresh_token": refresh_token}, headers=headers
    )
    assert logout.status_code == 204

    after_logout = await client.get("/auth/me", headers=headers)
    assert after_logout.status_code == 401

    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_logout_all_invalidates_every_active_token(client, db_session):
    user = await _make_user(db_session, "student", password="clave-real-123")

    login_a = await client.post(
        "/auth/login", json={"email": user.email, "password": "clave-real-123"}
    )
    login_b = await client.post(
        "/auth/login", json={"email": user.email, "password": "clave-real-123"}
    )
    token_a = login_a.json()["access_token"]
    token_b = login_b.json()["access_token"]

    logout_all = await client.post(
        "/auth/logout-all", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert logout_all.status_code == 204

    assert (await client.get("/auth/me", headers={"Authorization": f"Bearer {token_a}"})).status_code == 401
    assert (await client.get("/auth/me", headers={"Authorization": f"Bearer {token_b}"})).status_code == 401

    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_admin_can_revoke_sessions_of_a_manageable_user(client, db_session):
    admin = await _make_user(db_session, "admin", password="clave-admin-123")
    student = await _make_user(db_session, "student", password="clave-real-123")

    admin_login = await client.post(
        "/auth/login", json={"email": admin.email, "password": "clave-admin-123"}
    )
    student_login = await client.post(
        "/auth/login", json={"email": student.email, "password": "clave-real-123"}
    )
    admin_token = admin_login.json()["access_token"]
    student_token = student_login.json()["access_token"]

    response = await client.post(
        f"/auth/users/{student.id}/revoke-sessions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 204

    assert (
        await client.get("/auth/me", headers={"Authorization": f"Bearer {student_token}"})
    ).status_code == 401

    await db_session.delete(admin)
    await db_session.delete(student)
    await db_session.commit()


@pytest.mark.asyncio
async def test_student_cannot_revoke_sessions(client, db_session):
    student = await _make_user(db_session, "student", password="clave-real-123")
    other_student = await _make_user(db_session, "student", password="clave-otra-123")

    login = await client.post(
        "/auth/login", json={"email": student.email, "password": "clave-real-123"}
    )
    token = login.json()["access_token"]

    response = await client.post(
        f"/auth/users/{other_student.id}/revoke-sessions",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    await db_session.delete(student)
    await db_session.delete(other_student)
    await db_session.commit()
