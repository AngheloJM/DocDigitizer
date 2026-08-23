import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.permissions import is_staff
from app.documents.models import AuditLog, Document, ExtractedText, GeneratedPdf, OriginalImage
from app.documents.schemas import DocumentCreate, DocumentUpdate
from app.folders.models import Folder


class InvalidFolderError(Exception):
    pass


async def _folder_belongs_to(db: AsyncSession, folder_id: uuid.UUID, owner_user_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(Folder.id).where(Folder.id == folder_id, Folder.user_id == owner_user_id)
    )
    return result.scalar_one_or_none() is not None


async def get_document(db: AsyncSession, document_id: uuid.UUID, requesting_user: User) -> Document | None:
    if is_staff(requesting_user):
        result = await db.execute(select(Document).where(Document.id == document_id))
    else:
        result = await db.execute(
            select(Document).where(Document.id == document_id, Document.user_id == requesting_user.id)
        )
    return result.scalar_one_or_none()


async def list_documents(
    db: AsyncSession,
    requesting_user: User,
    folder_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    doc_type: str | None = None,
    owner_id: uuid.UUID | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Document], int]:
    target_user_id = requesting_user.id
    if is_staff(requesting_user) and owner_id is not None:
        target_user_id = owner_id

    query = select(Document).where(Document.user_id == target_user_id)
    count_query = select(func.count()).select_from(Document).where(Document.user_id == target_user_id)

    if folder_id is not None:
        query = query.where(Document.folder_id == folder_id)
        count_query = count_query.where(Document.folder_id == folder_id)
    if status_filter is not None:
        query = query.where(Document.status == status_filter)
        count_query = count_query.where(Document.status == status_filter)
    if doc_type is not None:
        query = query.where(Document.doc_type == doc_type)
        count_query = count_query.where(Document.doc_type == doc_type)

    query = query.order_by(Document.created_at.desc()).offset((page - 1) * per_page).limit(per_page)

    total = (await db.execute(count_query)).scalar_one()
    items = list((await db.execute(query)).scalars().all())
    return items, total


async def create_document(db: AsyncSession, owner_user_id: uuid.UUID, data: DocumentCreate) -> Document:
    if data.folder_id is not None and not await _folder_belongs_to(db, data.folder_id, owner_user_id):
        raise InvalidFolderError("La carpeta no existe o no te pertenece")

    document = Document(
        title=data.title,
        description=data.description,
        doc_type=data.doc_type,
        folder_id=data.folder_id,
        user_id=owner_user_id,
        status="pending",
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


async def update_document(db: AsyncSession, document: Document, data: DocumentUpdate) -> Document:
    if data.folder_id is not None and not await _folder_belongs_to(db, data.folder_id, document.user_id):
        raise InvalidFolderError("La carpeta no existe o no pertenece al mismo propietario")

    if data.title is not None:
        document.title = data.title
    if data.description is not None:
        document.description = data.description
    if data.doc_type is not None:
        document.doc_type = data.doc_type
    if data.folder_id is not None:
        document.folder_id = data.folder_id

    await db.commit()
    await db.refresh(document)
    return document


async def get_document_relations(
    db: AsyncSession, document_id: uuid.UUID
) -> tuple[OriginalImage | None, GeneratedPdf | None, ExtractedText | None]:
    original_image = (
        await db.execute(select(OriginalImage).where(OriginalImage.document_id == document_id))
    ).scalar_one_or_none()

    generated_pdf = (
        await db.execute(
            select(GeneratedPdf)
            .where(GeneratedPdf.document_id == document_id)
            .order_by(GeneratedPdf.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    extracted_text = (
        await db.execute(select(ExtractedText).where(ExtractedText.document_id == document_id))
    ).scalar_one_or_none()

    return original_image, generated_pdf, extracted_text


async def delete_document(db: AsyncSession, document: Document) -> None:
    await db.delete(document)
    await db.commit()


async def log_audit_action(
    db: AsyncSession,
    user_id: uuid.UUID,
    action: str,
    document_id: uuid.UUID | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    details: dict | None = None,
) -> None:
    entry = AuditLog(
        user_id=user_id,
        document_id=document_id,
        action=action,
        ip_address=ip_address,
        user_agent=user_agent,
        details=details,
    )
    db.add(entry)
    await db.commit()
