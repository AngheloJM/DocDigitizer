import uuid

import pytest
from sqlalchemy import select

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
from app.documents.models import AuditLog
from app.documents.schemas import DocumentCreate, DocumentUpdate
from app.documents.service import (
    InvalidFolderError,
    create_document,
    get_document,
    list_documents,
    log_audit_action,
    update_document,
)
from app.folders.schemas import FolderCreate
from app.folders.service import create_folder


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


@pytest.mark.asyncio
async def test_create_document_without_folder(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Acta 2026"))

    assert document.title == "Acta 2026"
    assert document.status == "pending"
    assert document.folder_id is None

    await db_session.delete(document)
    await db_session.commit()


@pytest.mark.asyncio
async def test_create_document_rejects_folder_from_another_user(db_session, test_user):
    other_user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Otro Usuario",
    )
    db_session.add(other_user)
    await db_session.commit()
    await db_session.refresh(other_user)

    other_folder = await create_folder(db_session, other_user.id, FolderCreate(name="Carpeta ajena"))

    with pytest.raises(InvalidFolderError):
        await create_document(
            db_session, test_user.id, DocumentCreate(title="Acta", folder_id=other_folder.id)
        )

    await db_session.delete(other_folder)
    await db_session.commit()
    await db_session.delete(other_user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_admin_can_access_another_users_document(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Acta"))

    admin = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Admin de Test",
        role="admin",
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)

    found = await get_document(db_session, document.id, admin)
    assert found is not None

    await db_session.delete(document)
    await db_session.delete(admin)
    await db_session.commit()


@pytest.mark.asyncio
async def test_student_cannot_access_another_users_document(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Acta"))

    other_student = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Otro Estudiante",
    )
    db_session.add(other_student)
    await db_session.commit()
    await db_session.refresh(other_student)

    found = await get_document(db_session, document.id, other_student)
    assert found is None

    await db_session.delete(document)
    await db_session.delete(other_student)
    await db_session.commit()


@pytest.mark.asyncio
async def test_admin_lists_documents_from_all_users_without_owner_filter(db_session, test_user):
    own_document = await create_document(db_session, test_user.id, DocumentCreate(title="Propio del admin"))

    other_student = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Otro Estudiante",
    )
    db_session.add(other_student)
    await db_session.commit()
    await db_session.refresh(other_student)
    other_document = await create_document(
        db_session, other_student.id, DocumentCreate(title="De otro estudiante")
    )

    admin = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Admin de Test",
        role="admin",
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)

    items, total = await list_documents(db_session, admin)
    ids = {item.id for item in items}

    assert own_document.id in ids
    assert other_document.id in ids
    assert total >= 2

    await db_session.delete(own_document)
    await db_session.delete(other_document)
    await db_session.delete(other_student)
    await db_session.delete(admin)
    await db_session.commit()


@pytest.mark.asyncio
async def test_student_only_lists_own_documents(db_session, test_user):
    own_document = await create_document(db_session, test_user.id, DocumentCreate(title="Propio"))

    other_student = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name="Otro Estudiante",
    )
    db_session.add(other_student)
    await db_session.commit()
    await db_session.refresh(other_student)
    other_document = await create_document(
        db_session, other_student.id, DocumentCreate(title="Ajeno")
    )

    items, total = await list_documents(db_session, test_user)
    ids = {item.id for item in items}

    assert own_document.id in ids
    assert other_document.id not in ids

    await db_session.delete(own_document)
    await db_session.delete(other_document)
    await db_session.delete(other_student)
    await db_session.commit()


@pytest.mark.asyncio
async def test_list_documents_filters_by_status(db_session, test_user):
    doc_pending = await create_document(db_session, test_user.id, DocumentCreate(title="Pendiente"))
    doc_other = await create_document(db_session, test_user.id, DocumentCreate(title="Completado"))
    doc_other.status = "completed"
    await db_session.commit()

    pending_items, pending_total = await list_documents(db_session, test_user, status_filter="pending")
    completed_items, completed_total = await list_documents(db_session, test_user, status_filter="completed")

    assert pending_total == 1
    assert pending_items[0].id == doc_pending.id
    assert completed_total == 1
    assert completed_items[0].id == doc_other.id

    await db_session.delete(doc_pending)
    await db_session.delete(doc_other)
    await db_session.commit()


@pytest.mark.asyncio
async def test_update_document_title(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Original"))

    updated = await update_document(db_session, document, DocumentUpdate(title="Actualizado"))

    assert updated.title == "Actualizado"

    await db_session.delete(document)
    await db_session.commit()


@pytest.mark.asyncio
async def test_log_audit_action_creates_entry(db_session, test_user):
    await log_audit_action(db_session, test_user.id, action="login")

    result = await db_session.execute(select(AuditLog).where(AuditLog.user_id == test_user.id))
    entry = result.scalar_one()
    assert entry.action == "login"

    await db_session.delete(entry)
    await db_session.commit()
