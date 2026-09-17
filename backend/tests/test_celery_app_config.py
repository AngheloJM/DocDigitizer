import ssl

from app.worker.celery_app import _ssl_options_if_needed


def test_ssl_options_are_none_for_plain_redis_url():
    assert _ssl_options_if_needed("redis://localhost:6379/0") is None


def test_ssl_options_require_cert_validation_for_rediss_url():
    assert _ssl_options_if_needed("rediss://default:secret@example.upstash.io:6379/0") == {
        "ssl_cert_reqs": ssl.CERT_REQUIRED
    }
