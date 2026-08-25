from app.config import _normalize_asyncpg_url


def test_normalizes_neon_style_url():
    url = (
        "postgresql+asyncpg://user:pass@host.neon.tech/db"
        "?sslmode=require&channel_binding=require"
    )

    result = _normalize_asyncpg_url(url)

    assert "channel_binding" not in result
    assert "sslmode" not in result
    assert "ssl=require" in result


def test_leaves_url_without_query_untouched():
    url = "postgresql+asyncpg://user:pass@localhost:5432/db"

    assert _normalize_asyncpg_url(url) == url


def test_does_not_touch_sync_driver_urls():
    url = "postgresql+psycopg2://user:pass@host/db?sslmode=require"

    assert _normalize_asyncpg_url(url) == url


def test_sslmode_disable_is_not_converted_to_ssl_require():
    url = "postgresql+asyncpg://user:pass@localhost/db?sslmode=disable"

    result = _normalize_asyncpg_url(url)

    assert "ssl=require" not in result
