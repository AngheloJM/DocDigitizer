from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_SECRET_KEYS = {"changeme", "secret", "", "test"}


def _normalize_asyncpg_url(value: str) -> str:
    split = urlsplit(value)
    if "+asyncpg" not in split.scheme or not split.query:
        return value

    query = dict(parse_qsl(split.query))
    query.pop("channel_binding", None)

    sslmode = query.pop("sslmode", None)
    if sslmode is not None and sslmode.lower() != "disable" and "ssl" not in query:
        query["ssl"] = "require"

    new_query = urlencode(query)
    return urlunsplit((split.scheme, split.netloc, split.path, new_query, split.fragment))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_env: str = "development"
    secret_key: str

    @field_validator("secret_key")
    @classmethod
    def secret_key_must_be_strong(cls, value: str) -> str:
        if value.lower() in INSECURE_SECRET_KEYS or len(value) < 32:
            raise ValueError(
                "SECRET_KEY debe ser un valor unico de al menos 32 caracteres, "
                "no un placeholder. Genera uno con: python -c \"import secrets; "
                "print(secrets.token_urlsafe(32))\""
            )
        return value

    database_url: str

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        return _normalize_asyncpg_url(value)

    redis_url: str
    celery_broker_url: str
    celery_result_backend: str

    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_originals: str = "originals"
    minio_bucket_processed: str = "processed"
    minio_secure: bool = False

    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    cors_allowed_origins: list[str] = ["http://localhost:3000"]

    allowed_email_domains: list[str] = []

    worker_wake_url: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
