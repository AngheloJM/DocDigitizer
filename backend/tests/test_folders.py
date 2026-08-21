import uuid

import pytest

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal
from app.folders.schemas import FolderCreate, FolderUpdate
from app.folders.service import InvalidParentError, create_folder, get_folder, update_folder


@pytest.fixture
async def db_session():
    async with SessionLocal() as session:
        yield session


@pytest.fixture
async def test_user(db_session):
    user = User(
        email=f"{uuid.uuid4()}@test.local",
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
async def test_create_folder_without_parent(db_session, test_user):
    folder = await create_folder(db_session, test_user.id, FolderCreate(name="Actas 2026"))

    assert folder.name == "Actas 2026"
    assert folder.parent_id is None

    await db_session.delete(folder)
    await db_session.commit()


@pytest.mark.asyncio
async def test_folder_cannot_be_its_own_parent(db_session, test_user):
    folder = await create_folder(db_session, test_user.id, FolderCreate(name="Raiz"))

    with pytest.raises(InvalidParentError):
        await update_folder(db_session, folder, FolderUpdate(parent_id=folder.id))

    await db_session.delete(folder)
    await db_session.commit()


@pytest.mark.asyncio
async def test_folder_cannot_be_moved_into_its_own_descendant(db_session, test_user):
    root = await create_folder(db_session, test_user.id, FolderCreate(name="Raiz"))
    child = await create_folder(
        db_session, test_user.id, FolderCreate(name="Hijo", parent_id=root.id)
    )

    with pytest.raises(InvalidParentError):
        await update_folder(db_session, root, FolderUpdate(parent_id=child.id))

    await db_session.delete(child)
    await db_session.commit()
    await db_session.delete(root)
    await db_session.commit()


@pytest.mark.asyncio
async def test_admin_can_access_another_users_folder(db_session, test_user):
    folder = await create_folder(db_session, test_user.id, FolderCreate(name="De un estudiante"))

    admin = User(
        email=f"{uuid.uuid4()}@test.local",
        password_hash=hash_password("irrelevante123"),
        full_name="Admin de Test",
        role="admin",
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)

    found = await get_folder(db_session, folder.id, admin)
    assert found is not None
    assert found.id == folder.id

    await db_session.delete(folder)
    await db_session.delete(admin)
    await db_session.commit()


@pytest.mark.asyncio
async def test_student_cannot_access_another_users_folder(db_session, test_user):
    folder = await create_folder(db_session, test_user.id, FolderCreate(name="De un estudiante"))

    other_student = User(
        email=f"{uuid.uuid4()}@test.local",
        password_hash=hash_password("irrelevante123"),
        full_name="Otro Estudiante",
    )
    db_session.add(other_student)
    await db_session.commit()
    await db_session.refresh(other_student)

    found = await get_folder(db_session, folder.id, other_student)
    assert found is None

    await db_session.delete(folder)
    await db_session.delete(other_student)
    await db_session.commit()
