import math
import uuid

from fastapi import APIRouter, HTTPException, Request, status

from app.dependencies import CurrentUser, DbSession
from app.documents import service
from app.documents.schemas import (
    DocumentCreate,
    DocumentDetailResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUpdate,
)
from app.documents.service import InvalidFolderError

router = APIRouter()


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(data: DocumentCreate, db: DbSession, current_user: CurrentUser, request: Request):
    try:
        document = await service.create_document(db, current_user.id, data)
    except InvalidFolderError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))

    await service.log_audit_action(
        db,
        current_user.id,
        action="upload",
        document_id=document.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return document


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    db: DbSession,
    current_user: CurrentUser,
    folder_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    doc_type: str | None = None,
    owner_id: uuid.UUID | None = None,
    page: int = 1,
    per_page: int = 20,
):
    items, total = await service.list_documents(
        db, current_user, folder_id, status_filter, doc_type, owner_id, page, per_page
    )
    pages = math.ceil(total / per_page) if total else 0
    return DocumentListResponse(items=items, total=total, page=page, pages=pages)


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document(document_id: uuid.UUID, db: DbSession, current_user: CurrentUser, request: Request):
    document = await service.get_document(db, document_id, current_user)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    original_image, generated_pdf, extracted_text = await service.get_document_relations(db, document_id)

    await service.log_audit_action(
        db,
        current_user.id,
        action="view",
        document_id=document.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return DocumentDetailResponse(
        **DocumentResponse.model_validate(document).model_dump(),
        original_image=original_image,
        generated_pdf=generated_pdf,
        extracted_text=extracted_text,
    )


@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(document_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    document = await service.get_document(db, document_id, current_user)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")
    return document


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: uuid.UUID, data: DocumentUpdate, db: DbSession, current_user: CurrentUser
):
    document = await service.get_document(db, document_id, current_user)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    try:
        return await service.update_document(db, document, data)
    except InvalidFolderError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: uuid.UUID, db: DbSession, current_user: CurrentUser, request: Request):
    document = await service.get_document(db, document_id, current_user)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    await service.log_audit_action(
        db,
        current_user.id,
        action="delete",
        document_id=document.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await service.delete_document(db, document)
