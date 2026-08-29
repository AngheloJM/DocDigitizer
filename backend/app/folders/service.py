import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.permissions import is_staff
from app.folders.models import Folder
from app.folders.schemas import FolderCreate, FolderUpdate


class InvalidParentError(Exception):
    pass


async def _get_owned_folder(db: AsyncSession, folder_id: uuid.UUID, owner_user_id: uuid.UUID) -> Folder | None:
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == owner_user_id)
    )
    return result.scalar_one_or_none()


async def get_folder(db: AsyncSession, folder_id: uuid.UUID, requesting_user: User) -> Folder | None:
    if is_staff(requesting_user):
        result = await db.execute(select(Folder).where(Folder.id == folder_id))
        return result.scalar_one_or_none()
    return await _get_owned_folder(db, folder_id, requesting_user.id)


async def list_folders(
    db: AsyncSession,
    requesting_user: User,
    parent_id: uuid.UUID | None,
    owner_id: uuid.UUID | None = None,
) -> list[Folder]:
    query = select(Folder).where(Folder.parent_id == parent_id)

    if is_staff(requesting_user):
        if owner_id is not None:
            query = query.where(Folder.user_id == owner_id)
        # sin owner_id, el staff ve carpetas de todos los usuarios (archivo institucional)
    else:
        query = query.where(Folder.user_id == requesting_user.id)

    result = await db.execute(query)
    return list(result.scalars().all())


async def _is_descendant(db: AsyncSession, folder_id: uuid.UUID, candidate_ancestor_id: uuid.UUID) -> bool:
    current_id: uuid.UUID | None = candidate_ancestor_id
    while current_id is not None:
        if current_id == folder_id:
            return True
        result = await db.execute(select(Folder.parent_id).where(Folder.id == current_id))
        current_id = result.scalar_one_or_none()
    return False


async def _validate_parent(
    db: AsyncSession, owner_user_id: uuid.UUID, parent_id: uuid.UUID | None, folder_id: uuid.UUID | None
) -> None:
    if parent_id is None:
        return

    parent = await _get_owned_folder(db, parent_id, owner_user_id)
    if parent is None:
        raise InvalidParentError("La carpeta padre no existe o no pertenece al mismo propietario")

    if folder_id is not None:
        if parent_id == folder_id:
            raise InvalidParentError("Una carpeta no puede ser padre de si misma")
        if await _is_descendant(db, folder_id, parent_id):
            raise InvalidParentError("No se puede mover una carpeta dentro de su propia subcarpeta")


async def create_folder(db: AsyncSession, owner_user_id: uuid.UUID, data: FolderCreate) -> Folder:
    await _validate_parent(db, owner_user_id, data.parent_id, folder_id=None)

    folder = Folder(
        name=data.name,
        description=data.description,
        user_id=owner_user_id,
        parent_id=data.parent_id,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder


async def update_folder(db: AsyncSession, folder: Folder, data: FolderUpdate) -> Folder:
    if data.parent_id is not None:
        await _validate_parent(db, folder.user_id, data.parent_id, folder_id=folder.id)

    if data.name is not None:
        folder.name = data.name
    if data.description is not None:
        folder.description = data.description
    if data.parent_id is not None:
        folder.parent_id = data.parent_id

    await db.commit()
    await db.refresh(folder)
    return folder


async def delete_folder(db: AsyncSession, folder: Folder) -> None:
    await db.delete(folder)
    await db.commit()
