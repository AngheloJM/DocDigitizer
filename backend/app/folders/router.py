import uuid

from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUser, DbSession
from app.folders import service
from app.folders.schemas import FolderCreate, FolderResponse, FolderUpdate
from app.folders.service import InvalidParentError

router = APIRouter()


@router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(data: FolderCreate, db: DbSession, current_user: CurrentUser):
    try:
        return await service.create_folder(db, current_user.id, data)
    except InvalidParentError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@router.get("", response_model=list[FolderResponse])
async def list_folders(
    db: DbSession,
    current_user: CurrentUser,
    parent_id: uuid.UUID | None = None,
    owner_id: uuid.UUID | None = None,
):
    return await service.list_folders(db, current_user, parent_id, owner_id)


@router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder(folder_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    folder = await service.get_folder(db, folder_id, current_user)
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carpeta no encontrada")
    return folder


@router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: uuid.UUID, data: FolderUpdate, db: DbSession, current_user: CurrentUser
):
    folder = await service.get_folder(db, folder_id, current_user)
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carpeta no encontrada")

    try:
        return await service.update_folder(db, folder, data)
    except InvalidParentError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(folder_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    folder = await service.get_folder(db, folder_id, current_user)
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carpeta no encontrada")

    await service.delete_folder(db, folder)
