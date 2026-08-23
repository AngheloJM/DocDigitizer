import io
from functools import lru_cache

from minio import Minio

from app.config import get_settings

_ensured_buckets: set[str] = set()


@lru_cache
def get_minio_client() -> Minio:
    settings = get_settings()
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_bucket(bucket: str) -> None:
    if bucket in _ensured_buckets:
        return

    client = get_minio_client()
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    _ensured_buckets.add(bucket)


def upload_bytes(bucket: str, object_name: str, data: bytes, content_type: str) -> None:
    ensure_bucket(bucket)
    client = get_minio_client()
    client.put_object(
        bucket,
        object_name,
        data=io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def download_bytes(bucket: str, object_name: str) -> bytes:
    client = get_minio_client()
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_object(bucket: str, object_name: str) -> None:
    client = get_minio_client()
    client.remove_object(bucket, object_name)
