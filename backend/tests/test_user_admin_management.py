import uuid

import pytest

from app.auth.models import User
from app.auth.schemas import UserAdminUpdate
from app.auth.service import (
    InvalidRoleAssignmentError,
    get_manageable_user,
    hash_password,
    list_users,
    update_user_admin,
)
from app.database import SessionLocal


@pytest.fixture
async def db_session():
    async with SessionLocal() as session:
        yield session


async def _make_user(db_session, role: str) -> User:
    user = User(
        email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
        password_hash=hash_password("irrelevante123"),
        full_name=f"Usuario {role}",
        role=role,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_admin_can_list_students_only(db_session):
    admin = await _make_user(db_session, "admin")
    student = await _make_user(db_session, "student")
    other_admin = await _make_user(db_session, "admin")

    items, total = await list_users(db_session, admin)

    ids = [u.id for u in items]
    assert student.id in ids
    assert other_admin.id not in ids

    for user in (admin, student, other_admin):
        await db_session.delete(user)
        await db_session.commit()


@pytest.mark.asyncio
async def test_super_admin_can_list_admins_and_students(db_session):
    super_admin = await _make_user(db_session, "super_admin")
    admin = await _make_user(db_session, "admin")
    student = await _make_user(db_session, "student")

    items, total = await list_users(db_session, super_admin)

    ids = [u.id for u in items]
    assert admin.id in ids
    assert student.id in ids
    assert super_admin.id not in ids

    for user in (super_admin, admin, student):
        await db_session.delete(user)
        await db_session.commit()


@pytest.mark.asyncio
async def test_admin_cannot_see_another_admin_via_get_manageable_user(db_session):
    admin = await _make_user(db_session, "admin")
    other_admin = await _make_user(db_session, "admin")

    result = await get_manageable_user(db_session, admin, other_admin.id)

    assert result is None

    await db_session.delete(admin)
    await db_session.delete(other_admin)
    await db_session.commit()


@pytest.mark.asyncio
async def test_admin_can_deactivate_student(db_session):
    admin = await _make_user(db_session, "admin")
    student = await _make_user(db_session, "student")

    updated = await update_user_admin(
        db_session, admin, student, UserAdminUpdate(is_active=False)
    )

    assert updated.is_active is False

    await db_session.delete(admin)
    await db_session.delete(student)
    await db_session.commit()


@pytest.mark.asyncio
async def test_admin_cannot_promote_student_to_admin(db_session):
    admin = await _make_user(db_session, "admin")
    student = await _make_user(db_session, "student")

    with pytest.raises(InvalidRoleAssignmentError):
        await update_user_admin(db_session, admin, student, UserAdminUpdate(role="admin"))

    await db_session.delete(admin)
    await db_session.delete(student)
    await db_session.commit()


@pytest.mark.asyncio
async def test_super_admin_can_promote_student_to_admin(db_session):
    super_admin = await _make_user(db_session, "super_admin")
    student = await _make_user(db_session, "student")

    updated = await update_user_admin(
        db_session, super_admin, student, UserAdminUpdate(role="admin")
    )

    assert updated.role == "admin"

    await db_session.delete(super_admin)
    await db_session.delete(student)
    await db_session.commit()
