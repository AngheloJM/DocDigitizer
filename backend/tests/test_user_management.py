import uuid

import pytest

from app.auth.models import User
from app.auth.schemas import UserCreate
from app.auth.service import InvalidRoleAssignmentError, create_user, hash_password
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
async def test_admin_can_create_student(db_session):
    admin = await _make_user(db_session, "admin")

    new_student = await create_user(
        db_session,
        admin,
        UserCreate(
            email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
            password="irrelevante123",
            full_name="Nuevo Estudiante",
            role="student",
        ),
    )

    assert new_student.role == "student"

    await db_session.delete(new_student)
    await db_session.delete(admin)
    await db_session.commit()


@pytest.mark.asyncio
async def test_admin_cannot_create_admin(db_session):
    admin = await _make_user(db_session, "admin")

    with pytest.raises(InvalidRoleAssignmentError):
        await create_user(
            db_session,
            admin,
            UserCreate(
                email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
                password="irrelevante123",
                full_name="Otro Admin",
                role="admin",
            ),
        )

    await db_session.delete(admin)
    await db_session.commit()


@pytest.mark.asyncio
async def test_super_admin_can_create_admin(db_session):
    super_admin = await _make_user(db_session, "super_admin")

    new_admin = await create_user(
        db_session,
        super_admin,
        UserCreate(
            email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
            password="irrelevante123",
            full_name="Nuevo Admin",
            role="admin",
        ),
    )

    assert new_admin.role == "admin"

    await db_session.delete(new_admin)
    await db_session.delete(super_admin)
    await db_session.commit()


@pytest.mark.asyncio
async def test_student_cannot_create_anyone(db_session):
    student = await _make_user(db_session, "student")

    with pytest.raises(InvalidRoleAssignmentError):
        await create_user(
            db_session,
            student,
            UserCreate(
                email=f"{uuid.uuid4()}@utepsa-test.edu.bo",
                password="irrelevante123",
                full_name="Alguien",
                role="student",
            ),
        )

    await db_session.delete(student)
    await db_session.commit()
