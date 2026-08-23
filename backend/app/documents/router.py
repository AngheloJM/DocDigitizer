import math
import uuid

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile, status

from app.dependencies import CurrentUser, DbSession
from app.documents import service
from app.documents.schemas import (
    DocumentCreate,
    DocumentDetailResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUpdate,
    DocumentUploadResponse,
)
from app.documents.service import (
    DocumentAlreadyHasFileError,
    InvalidFileError,
    InvalidFolderError,
    NoDownloadableFileError,
)
from app.worker.tasks import process_document

router = APIRouter()


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(data: DocumentCreate, db: DbSession, current_user: CurrentUser, request: Request):
    try:
        document = await service.create_document(db, current_user.id, data)
    except InvalidFolderError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))

    await service.log_audit_action(
        db,
        current_user.id,
        action="register",
        document_id=document.id,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return document


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    db: DbSession,
    current_user: CurrentUser,
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    description: str | None = Form(None),
    doc_type: str | None = Form(None),
    folder_id: uuid.UUID | None = Form(None),
):
    file_bytes = await file.read()
    data = DocumentCreate(title=title, description=description, doc_type=doc_type, folder_id=folder_id)

    try:
        document = await service.create_document_with_file(db, current_user.id, data, file_bytes, file.filename)
    except InvalidFolderError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))
    except InvalidFileError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))

    task = process_document.delay(str(document.id))
    document.celery_task_id = task.id
    await db.commit()

    await service.log_audit_action(
        db,
        current_user.id,
        action="upload",
        document_id=document.id,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return DocumentUploadResponse(document_id=document.id, task_id=task.id, status=document.status)


@router.post("/{document_id}/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document_file(
    document_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
    request: Request,
    file: UploadFile = File(...),
):
    document = await service.get_document(db, document_id, current_user)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    file_bytes = await file.read()

    try:
        await service.attach_file_to_document(db, document, file_bytes, file.filename)
    except InvalidFileError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))
    except DocumentAlreadyHasFileError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))

    task = process_document.delay(str(document.id))
    document.celery_task_id = task.id
    await db.commit()

    await service.log_audit_action(
        db,
        current_user.id,
        action="upload",
        document_id=document.id,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return DocumentUploadResponse(document_id=document.id, task_id=task.id, status=document.status)


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
        ip_address=_client_ip(request),
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


@router.get("/{document_id}/download")
async def download_document(document_id: uuid.UUID, db: DbSession, current_user: CurrentUser, request: Request):
    document = await service.get_document(db, document_id, current_user)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    try:
        data, filename, content_type = await service.get_downloadable_file(db, document)
    except NoDownloadableFileError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))

    await service.log_audit_action(
        db,
        current_user.id,
        action="download",
        document_id=document.id,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await service.delete_document(db, document)
