import uuid

import pytest

from app.auth.service import InvalidEmailDomainError, validate_email_domain
from app.config import get_settings

settings = get_settings()


@pytest.fixture(autouse=True)
def restrict_domains():
    original = settings.allowed_email_domains
    settings.allowed_email_domains = ["utepsa.edu.bo"]
    yield
    settings.allowed_email_domains = original


def test_accepts_email_with_allowed_domain():
    validate_email_domain(f"{uuid.uuid4()}@utepsa.edu.bo")


def test_accepts_email_with_allowed_domain_case_insensitive():
    validate_email_domain(f"{uuid.uuid4()}@UTEPSA.EDU.BO")


def test_rejects_email_with_disallowed_domain():
    with pytest.raises(InvalidEmailDomainError):
        validate_email_domain(f"{uuid.uuid4()}@gmail.com")


def test_no_restriction_when_list_is_empty():
    settings.allowed_email_domains = []
    validate_email_domain(f"{uuid.uuid4()}@cualquier-dominio.com")
