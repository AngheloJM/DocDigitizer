import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.worker.wake import wake_worker
from app.worker_web_wrapper import app as wrapper_app


@pytest.mark.asyncio
async def test_wake_worker_does_nothing_without_url(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "worker_wake_url", None)

    import app.worker.wake as wake_module

    monkeypatch.setattr(wake_module, "settings", settings)

    await wake_worker()  # no debe lanzar excepcion


@pytest.mark.asyncio
async def test_wake_worker_ignores_connection_errors(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "worker_wake_url", "http://127.0.0.1:1/health")

    import app.worker.wake as wake_module

    monkeypatch.setattr(wake_module, "settings", settings)

    await wake_worker()  # no debe lanzar excepcion aunque la conexion falle


@pytest.mark.asyncio
async def test_worker_wrapper_health_endpoint_reachable():
    transport = ASGITransport(app=wrapper_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] in ("ok", "worker_down")
