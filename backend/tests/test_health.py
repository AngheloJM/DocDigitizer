from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db_session
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_check_is_always_ok(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_readiness_check_reports_ok_when_all_dependencies_respond(client, monkeypatch):
    from app import main as main_module

    fake_redis = AsyncMock()
    monkeypatch.setattr(main_module, "get_redis_client", lambda: fake_redis)

    fake_minio = MagicMock()
    monkeypatch.setattr(main_module, "get_minio_client", lambda: fake_minio)

    class _FakeDb:
        async def execute(self, *_args, **_kwargs):
            return None

    async def _fake_db_session():
        yield _FakeDb()

    app.dependency_overrides[get_db_session] = _fake_db_session
    try:
        response = await client.get("/health/ready")
    finally:
        app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "checks": {"database": "ok", "redis": "ok", "storage": "ok"},
    }


@pytest.mark.asyncio
async def test_readiness_check_reports_error_when_a_dependency_fails(client, monkeypatch):
    from app import main as main_module

    fake_redis = AsyncMock()
    fake_redis.ping.side_effect = ConnectionError("redis no disponible")
    monkeypatch.setattr(main_module, "get_redis_client", lambda: fake_redis)

    fake_minio = MagicMock()
    monkeypatch.setattr(main_module, "get_minio_client", lambda: fake_minio)

    class _FakeDb:
        async def execute(self, *_args, **_kwargs):
            return None

    async def _fake_db_session():
        yield _FakeDb()

    app.dependency_overrides[get_db_session] = _fake_db_session
    try:
        response = await client.get("/health/ready")
    finally:
        app.dependency_overrides.pop(get_db_session, None)

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "error"
    assert body["checks"]["redis"] == "error"
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["storage"] == "ok"
