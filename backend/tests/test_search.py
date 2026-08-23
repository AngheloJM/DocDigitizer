import uuid

import pytest

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
from app.documents.models import ExtractedText
from app.documents.schemas import DocumentCreate
from app.documents.service import create_document, search_documents


@pytest.fixture
async def db_session():
    async with SessionLocal() as session:
        yield session


@pytest.fixture
async def test_user(db_session):
    user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Usuario de Test",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    yield user
    await db_session.delete(user)
    await db_session.commit()


async def _make_document_with_text(db_session, user, title, raw_text, doc_type=None):
    document = await create_document(
        db_session, user.id, DocumentCreate(title=title, doc_type=doc_type)
    )
    extracted = ExtractedText(
        document_id=document.id,
        raw_text=raw_text,
        ocr_confidence=90.0,
        ocr_engine="tesseract",
        word_count=len(raw_text.split()),
    )
    db_session.add(extracted)
    await db_session.commit()
    return document


@pytest.mark.asyncio
async def test_search_finds_document_by_content(db_session, test_user):
    doc1 = await _make_document_with_text(
        db_session, test_user, "Acta 2026", "certificado de calificaciones del estudiante"
    )
    doc2 = await _make_document_with_text(
        db_session, test_user, "Factura 2026", "factura de compra de materiales"
    )

    results, total = await search_documents(db_session, test_user, q="certificado calificaciones")

    assert total == 1
    assert results[0][0].id == doc1.id
    assert "certificado" in results[0][1].lower() or "calificaciones" in results[0][1].lower()

    await db_session.delete(doc1)
    await db_session.delete(doc2)
    await db_session.commit()


@pytest.mark.asyncio
async def test_search_filters_by_doc_type(db_session, test_user):
    doc1 = await _make_document_with_text(
        db_session, test_user, "Acta", "reunion de consejo universitario", doc_type="acta"
    )
    doc2 = await _make_document_with_text(
        db_session, test_user, "Certificado", "reunion de consejo universitario", doc_type="certificado"
    )

    results, total = await search_documents(
        db_session, test_user, q="reunion consejo", doc_type="acta"
    )

    assert total == 1
    assert results[0][0].id == doc1.id

    await db_session.delete(doc1)
    await db_session.delete(doc2)
    await db_session.commit()


@pytest.mark.asyncio
async def test_search_returns_nothing_for_unrelated_query(db_session, test_user):
    doc = await _make_document_with_text(
        db_session, test_user, "Acta", "certificado de calificaciones"
    )

    results, total = await search_documents(db_session, test_user, q="factura contrato inexistente")

    assert total == 0
    assert results == []

    await db_session.delete(doc)
    await db_session.commit()


@pytest.mark.asyncio
async def test_search_does_not_find_another_users_document(db_session, test_user):
    other_user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Otro Usuario",
    )
    db_session.add(other_user)
    await db_session.commit()
    await db_session.refresh(other_user)

    doc = await _make_document_with_text(
        db_session, other_user, "Acta ajena", "certificado de calificaciones"
    )

    results, total = await search_documents(db_session, test_user, q="certificado calificaciones")

    assert total == 0

    await db_session.delete(doc)
    await db_session.commit()
    await db_session.delete(other_user)
    await db_session.commit()
