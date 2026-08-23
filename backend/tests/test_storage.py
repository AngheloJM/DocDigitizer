import uuid

import pytest
from minio.error import S3Error

from app.storage.minio_client import delete_object, download_bytes, upload_bytes

TEST_BUCKET = "originals"


def test_upload_and_download_roundtrip():
    object_name = f"tests/{uuid.uuid4()}.txt"
    content = b"contenido de prueba"

    upload_bytes(TEST_BUCKET, object_name, content, "text/plain")
    try:
        downloaded = download_bytes(TEST_BUCKET, object_name)
        assert downloaded == content
    finally:
        delete_object(TEST_BUCKET, object_name)


def test_download_missing_object_raises():
    with pytest.raises(S3Error):
        download_bytes(TEST_BUCKET, f"tests/{uuid.uuid4()}-no-existe.txt")
