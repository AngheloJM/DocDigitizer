import uuid

import pytest

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
from app.documents.schemas import DocumentCreate
from app.documents.service import (
    create_document,
    delete_document,
    get_document,
    list_documents,
    restore_document,
    soft_delete_document,
)


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
async def test_soft_deleted_document_is_hidden_from_get_document(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Acta"))

    await soft_delete_document(db_session, document)

    assert await get_document(db_session, document.id, test_user) is None
    assert await get_document(db_session, document.id, test_user, include_deleted=True) is not None

    await delete_document(db_session, document)


@pytest.mark.asyncio
async def test_soft_deleted_document_is_hidden_from_list_documents(db_session, test_user):
    active = await create_document(db_session, test_user.id, DocumentCreate(title="Activo"))
    deleted = await create_document(db_session, test_user.id, DocumentCreate(title="Borrado"))
    await soft_delete_document(db_session, deleted)

    items, total = await list_documents(db_session, test_user, page=1, per_page=20)
    ids = {item.id for item in items}
    assert active.id in ids
    assert deleted.id not in ids

    trash_items, trash_total = await list_documents(
        db_session, test_user, page=1, per_page=20, include_deleted=True
    )
    trash_ids = {item.id for item in trash_items}
    assert deleted.id in trash_ids
    assert active.id not in trash_ids
    assert trash_total >= 1

    await delete_document(db_session, active)
    await delete_document(db_session, deleted)


@pytest.mark.asyncio
async def test_restore_document_makes_it_visible_again(db_session, test_user):
    document = await create_document(db_session, test_user.id, DocumentCreate(title="Acta"))
    await soft_delete_document(db_session, document)

    restored = await restore_document(db_session, document)

    assert restored.deleted_at is None
    assert await get_document(db_session, document.id, test_user) is not None

    await delete_document(db_session, document)
