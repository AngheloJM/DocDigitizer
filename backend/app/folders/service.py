import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.folders.models import Folder
from app.folders.schemas import FolderCreate, FolderUpdate


class InvalidParentError(Exception):
    pass


async def get_folder(db: AsyncSession, folder_id: uuid.UUID, user_id: uuid.UUID) -> Folder | None:
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def list_folders(db: AsyncSession, user_id: uuid.UUID, parent_id: uuid.UUID | None) -> list[Folder]:
    result = await db.execute(
        select(Folder).where(Folder.user_id == user_id, Folder.parent_id == parent_id)
    )
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
    db: AsyncSession, user_id: uuid.UUID, parent_id: uuid.UUID | None, folder_id: uuid.UUID | None
) -> None:
    if parent_id is None:
        return

    parent = await get_folder(db, parent_id, user_id)
    if parent is None:
        raise InvalidParentError("La carpeta padre no existe o no te pertenece")

    if folder_id is not None:
        if parent_id == folder_id:
            raise InvalidParentError("Una carpeta no puede ser padre de si misma")
        if await _is_descendant(db, folder_id, parent_id):
            raise InvalidParentError("No se puede mover una carpeta dentro de su propia subcarpeta")


async def create_folder(db: AsyncSession, user_id: uuid.UUID, data: FolderCreate) -> Folder:
    await _validate_parent(db, user_id, data.parent_id, folder_id=None)

    folder = Folder(
        name=data.name,
        description=data.description,
        user_id=user_id,
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
