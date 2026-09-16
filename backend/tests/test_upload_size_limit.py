import pytest
from fastapi import HTTPException, Request

from app.documents.router import CONTENT_LENGTH_REJECT_THRESHOLD, _reject_if_declared_too_large


def _request_with_content_length(value: str | None) -> Request:
    headers = [(b"content-length", value.encode())] if value is not None else []
    return Request({"type": "http", "headers": headers})


def test_reject_if_declared_too_large_allows_within_limit():
    request = _request_with_content_length(str(CONTENT_LENGTH_REJECT_THRESHOLD - 1))
    _reject_if_declared_too_large(request)


def test_reject_if_declared_too_large_blocks_over_limit():
    request = _request_with_content_length(str(CONTENT_LENGTH_REJECT_THRESHOLD + 1))
    with pytest.raises(HTTPException) as exc_info:
        _reject_if_declared_too_large(request)
    assert exc_info.value.status_code == 413


def test_reject_if_declared_too_large_ignores_missing_header():
    request = _request_with_content_length(None)
    _reject_if_declared_too_large(request)


def test_reject_if_declared_too_large_ignores_invalid_header():
    request = _request_with_content_length("no-es-un-numero")
    _reject_if_declared_too_large(request)
