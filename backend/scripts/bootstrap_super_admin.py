import argparse
import asyncio
import getpass
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.auth.models import User
from app.auth.service import hash_password
from app.database import SessionLocal, engine


async def super_admin_exists(db) -> bool:
    result = await db.execute(select(User.id).where(User.role == "super_admin").limit(1))
    return result.scalar_one_or_none() is not None


async def run(email: str, full_name: str, password: str, force: bool) -> None:
    try:
        await _run(email, full_name, password, force)
    finally:
        await engine.dispose()


async def _run(email: str, full_name: str, password: str, force: bool) -> None:
    async with SessionLocal() as db:
        existing_email = (
            await db.execute(select(User.id).where(User.email == email))
        ).scalar_one_or_none()
        if existing_email is not None:
            print(f"Error: ya existe un usuario con el email '{email}'.")
            raise SystemExit(1)

        if not force and await super_admin_exists(db):
            print(
                "Ya existe un super_admin en la base de datos. "
                "Usa --force si de verdad quieres crear otro."
            )
            raise SystemExit(1)

        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            role="super_admin",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    print(f"super_admin creado: {user.email} (id: {user.id})")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Crea el primer usuario super_admin directamente en la base de datos."
    )
    parser.add_argument("--email", required=True)
    parser.add_argument("--full-name", required=True)
    parser.add_argument(
        "--force", action="store_true", help="Crear aunque ya exista otro super_admin"
    )
    args = parser.parse_args()

    env_password = os.environ.get("BOOTSTRAP_SUPER_ADMIN_PASSWORD")
    if env_password is not None:
        password = env_password
    else:
        password = getpass.getpass("Contrasena para el nuevo super_admin: ")
        password_confirm = getpass.getpass("Confirma la contrasena: ")
        if password != password_confirm:
            print("Error: las contrasenas no coinciden.")
            raise SystemExit(1)
    if len(password) < 8:
        print("Error: la contrasena debe tener al menos 8 caracteres.")
        raise SystemExit(1)

    asyncio.run(run(args.email, args.full_name, password, args.force))


if __name__ == "__main__":
    main()
