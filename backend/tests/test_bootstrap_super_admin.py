import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from bootstrap_super_admin import run  # noqa: E402

from app.auth.models import User
from app.database import SessionLocal


@pytest.fixture
async def db_session():
    async with SessionLocal() as session:
        yield session


@pytest.mark.asyncio
async def test_run_creates_super_admin(db_session):
    email = f"{uuid.uuid4()}@utepsa-test.edu.bo"

    await run(email, "Bootstrap Test", "password123", force=True)

    user = (
        await db_session.execute(select(User).where(User.email == email))
    ).scalar_one()
    assert user.role == "super_admin"

    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_run_rejects_duplicate_email(db_session):
    email = f"{uuid.uuid4()}@utepsa-test.edu.bo"
    await run(email, "Primero", "password123", force=True)

    with pytest.raises(SystemExit):
        await run(email, "Segundo", "password123", force=True)

    user = (
        await db_session.execute(select(User).where(User.email == email))
    ).scalar_one()
    await db_session.delete(user)
    await db_session.commit()


@pytest.mark.asyncio
async def test_run_rejects_second_super_admin_without_force(db_session):
    email1 = f"{uuid.uuid4()}@utepsa-test.edu.bo"
    email2 = f"{uuid.uuid4()}@utepsa-test.edu.bo"
    await run(email1, "Primero", "password123", force=True)

    with pytest.raises(SystemExit):
        await run(email2, "Segundo", "password123", force=False)

    user1 = (
        await db_session.execute(select(User).where(User.email == email1))
    ).scalar_one()
    await db_session.delete(user1)
    await db_session.commit()
