import hashlib
import io
import uuid
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.permissions import is_staff
from app.config import get_settings
from app.documents.models import AuditLog, Document, ExtractedText, GeneratedPdf, OriginalImage
from app.documents.schemas import DocumentCreate, DocumentUpdate
from app.folders.models import Folder
from app.storage.minio_client import delete_object, download_bytes, upload_bytes

settings = get_settings()

MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "tiff", "tif", "bmp", "pdf"}


class NoDownloadableFileError(Exception):
    pass


class NoOriginalFileError(Exception):
    pass

_CONTENT_TYPE_BY_EXTENSION = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "tiff": "image/tiff",
    "tif": "image/tiff",
    "bmp": "image/bmp",
    "pdf": "application/pdf",
}


class InvalidFolderError(Exception):
    pass


class InvalidFileError(Exception):
    pass


class DocumentAlreadyHasFileError(Exception):
    pass


def _extension_from_filename(filename: str | None) -> str:
    if filename is None or "." not in filename:
        raise InvalidFileError("El archivo no tiene una extension reconocible")
    return filename.rsplit(".", 1)[1].lower()


def _image_dimensions(data: bytes, extension: str) -> tuple[int | None, int | None]:
    if extension == "pdf":
        return None, None
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as image:
            return image.width, image.height
    except Exception:
        return None, None


async def attach_file_to_document(
    db: AsyncSession, document: Document, file_bytes: bytes, filename: str | None
) -> OriginalImage:
    extension = _extension_from_filename(filename)
    if extension not in ALLOWED_EXTENSIONS:
        raise InvalidFileError(
            f"Formato no permitido '{extension}'. Formatos aceptados: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise InvalidFileError("El archivo excede el tamano maximo de 20 MB")

    existing = (
        await db.execute(select(OriginalImage).where(OriginalImage.document_id == document.id))
    ).scalar_one_or_none()
    if existing is not None:
        raise DocumentAlreadyHasFileError("Este documento ya tiene un archivo asociado")

    sha256_hash = hashlib.sha256(file_bytes).hexdigest()
    minio_path = f"originals/{document.user_id}/{document.id}.{extension}"
    content_type = _CONTENT_TYPE_BY_EXTENSION.get(extension, "application/octet-stream")

    upload_bytes(settings.minio_bucket_originals, minio_path, file_bytes, content_type)

    width_px, height_px = _image_dimensions(file_bytes, extension)

    original_image = OriginalImage(
        document_id=document.id,
        minio_path=minio_path,
        file_format=extension,
        file_size_bytes=len(file_bytes),
        sha256_hash=sha256_hash,
        width_px=width_px,
        height_px=height_px,
    )
    db.add(original_image)
    await db.commit()
    await db.refresh(original_image)
    return original_image


async def _folder_belongs_to(db: AsyncSession, folder_id: uuid.UUID, owner_user_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(Folder.id).where(Folder.id == folder_id, Folder.user_id == owner_user_id)
    )
    return result.scalar_one_or_none() is not None


class InvalidAssigneeError(Exception):
    pass


async def _validate_assignee(db: AsyncSession, requester_is_staff: bool, assigned_to_id: uuid.UUID) -> None:
    if not requester_is_staff:
        raise InvalidAssigneeError("Solo el staff (admin/super_admin) puede asignar documentos")
    exists = (await db.execute(select(User.id).where(User.id == assigned_to_id))).scalar_one_or_none()
    if exists is None:
        raise InvalidAssigneeError("El usuario asignado no existe")


def _owned_or_assigned(requesting_user: User):
    return or_(
        Document.user_id == requesting_user.id,
        Document.assigned_to_id == requesting_user.id,
    )


async def get_document(db: AsyncSession, document_id: uuid.UUID, requesting_user: User) -> Document | None:
    if is_staff(requesting_user):
        result = await db.execute(select(Document).where(Document.id == document_id))
    else:
        result = await db.execute(
            select(Document).where(
                Document.id == document_id, _owned_or_assigned(requesting_user)
            )
        )
    return result.scalar_one_or_none()


async def list_documents(
    db: AsyncSession,
    requesting_user: User,
    folder_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    doc_type: str | None = None,
    physical_shelf: str | None = None,
    archived_year: int | None = None,
    owner_id: uuid.UUID | None = None,
    assigned_to_id: uuid.UUID | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Document], int]:
    query = select(Document)
    count_query = select(func.count()).select_from(Document)

    if is_staff(requesting_user):
        if owner_id is not None:
            query = query.where(Document.user_id == owner_id)
            count_query = count_query.where(Document.user_id == owner_id)
        # sin owner_id, el staff ve documentos de todos los usuarios (archivo institucional)
    else:
        query = query.where(_owned_or_assigned(requesting_user))
        count_query = count_query.where(_owned_or_assigned(requesting_user))

    if assigned_to_id is not None:
        query = query.where(Document.assigned_to_id == assigned_to_id)
        count_query = count_query.where(Document.assigned_to_id == assigned_to_id)
    if folder_id is not None:
        query = query.where(Document.folder_id == folder_id)
        count_query = count_query.where(Document.folder_id == folder_id)
    if status_filter is not None:
        query = query.where(Document.status == status_filter)
        count_query = count_query.where(Document.status == status_filter)
    if doc_type is not None:
        query = query.where(Document.doc_type == doc_type)
        count_query = count_query.where(Document.doc_type == doc_type)
    if physical_shelf is not None:
        query = query.where(Document.physical_shelf == physical_shelf)
        count_query = count_query.where(Document.physical_shelf == physical_shelf)
    if archived_year is not None:
        query = query.where(Document.archived_year == archived_year)
        count_query = count_query.where(Document.archived_year == archived_year)

    query = query.order_by(Document.created_at.desc()).offset((page - 1) * per_page).limit(per_page)

    total = (await db.execute(count_query)).scalar_one()
    items = list((await db.execute(query)).scalars().all())
    return items, total


async def create_document(
    db: AsyncSession,
    owner_user_id: uuid.UUID,
    data: DocumentCreate,
    requester_is_staff: bool = False,
) -> Document:
    if data.folder_id is not None and not await _folder_belongs_to(db, data.folder_id, owner_user_id):
        raise InvalidFolderError("La carpeta no existe o no te pertenece")
    if data.assigned_to_id is not None:
        await _validate_assignee(db, requester_is_staff, data.assigned_to_id)

    document = Document(
        title=data.title,
        description=data.description,
        doc_type=data.doc_type,
        folder_id=data.folder_id,
        physical_shelf=data.physical_shelf,
        physical_division=data.physical_division,
        physical_column=data.physical_column,
        physical_volume=data.physical_volume,
        archived_year=data.archived_year,
        archived_month_start=data.archived_month_start,
        archived_month_end=data.archived_month_end,
        assigned_to_id=data.assigned_to_id,
        user_id=owner_user_id,
        status="pending",
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


async def create_document_with_file(
    db: AsyncSession,
    owner_user_id: uuid.UUID,
    data: DocumentCreate,
    file_bytes: bytes,
    filename: str | None,
    requester_is_staff: bool = False,
) -> Document:
    document = await create_document(db, owner_user_id, data, requester_is_staff)
    await attach_file_to_document(db, document, file_bytes, filename)
    return document


async def update_document(
    db: AsyncSession,
    document: Document,
    data: DocumentUpdate,
    requester_is_staff: bool = False,
) -> Document:
    if data.folder_id is not None and not await _folder_belongs_to(db, data.folder_id, document.user_id):
        raise InvalidFolderError("La carpeta no existe o no pertenece al mismo propietario")
    if data.assigned_to_id is not None:
        await _validate_assignee(db, requester_is_staff, data.assigned_to_id)
        document.assigned_to_id = data.assigned_to_id

    if data.title is not None:
        document.title = data.title
    if data.description is not None:
        document.description = data.description
    if data.doc_type is not None:
        document.doc_type = data.doc_type
    if data.folder_id is not None:
        document.folder_id = data.folder_id
    if data.physical_shelf is not None:
        document.physical_shelf = data.physical_shelf
    if data.physical_division is not None:
        document.physical_division = data.physical_division
    if data.physical_column is not None:
        document.physical_column = data.physical_column
    if data.physical_volume is not None:
        document.physical_volume = data.physical_volume
    if data.archived_year is not None:
        document.archived_year = data.archived_year
    if data.archived_month_start is not None:
        document.archived_month_start = data.archived_month_start
    if data.archived_month_end is not None:
        document.archived_month_end = data.archived_month_end

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


async def get_downloadable_file(db: AsyncSession, document: Document) -> tuple[bytes, str, str]:
    generated_pdf = (
        await db.execute(
            select(GeneratedPdf)
            .where(GeneratedPdf.document_id == document.id)
            .order_by(GeneratedPdf.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if generated_pdf is not None:
        data = download_bytes(settings.minio_bucket_processed, generated_pdf.minio_path)
        return data, f"{document.title}.pdf", "application/pdf"

    original_image = (
        await db.execute(select(OriginalImage).where(OriginalImage.document_id == document.id))
    ).scalar_one_or_none()

    if original_image is None:
        raise NoDownloadableFileError("Este documento no tiene ningun archivo asociado todavia")

    data = download_bytes(settings.minio_bucket_originals, original_image.minio_path)
    content_type = _CONTENT_TYPE_BY_EXTENSION.get(original_image.file_format, "application/octet-stream")
    return data, f"{document.title}.{original_image.file_format}", content_type


async def delete_document(db: AsyncSession, document: Document) -> None:
    original_image = (
        await db.execute(select(OriginalImage).where(OriginalImage.document_id == document.id))
    ).scalar_one_or_none()
    generated_pdfs = (
        await db.execute(select(GeneratedPdf).where(GeneratedPdf.document_id == document.id))
    ).scalars().all()

    await db.delete(document)
    await db.commit()

    if original_image is not None:
        delete_object(settings.minio_bucket_originals, original_image.minio_path)
    for generated_pdf in generated_pdfs:
        delete_object(settings.minio_bucket_processed, generated_pdf.minio_path)


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


async def search_documents(
    db: AsyncSession,
    requesting_user: User,
    q: str,
    doc_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    folder_id: uuid.UUID | None = None,
    owner_id: uuid.UUID | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[tuple[Document, str, float]], int]:
    tsquery = func.plainto_tsquery("spanish", q)
    matches = ExtractedText.tsv_content.op("@@")(tsquery)

    base_query = (
        select(Document, ExtractedText)
        .join(ExtractedText, ExtractedText.document_id == Document.id)
        .where(matches)
    )

    if is_staff(requesting_user):
        if owner_id is not None:
            base_query = base_query.where(Document.user_id == owner_id)
        # sin owner_id, el staff busca entre documentos de todos los usuarios
    else:
        base_query = base_query.where(_owned_or_assigned(requesting_user))

    if doc_type is not None:
        base_query = base_query.where(Document.doc_type == doc_type)
    if folder_id is not None:
        base_query = base_query.where(Document.folder_id == folder_id)
    if date_from is not None:
        base_query = base_query.where(Document.created_at >= date_from)
    if date_to is not None:
        base_query = base_query.where(Document.created_at <= date_to)

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    ranked_query = (
        base_query.add_columns(
            func.ts_rank(ExtractedText.tsv_content, tsquery).label("rank"),
            func.ts_headline(
                "spanish", ExtractedText.raw_text, tsquery, "MaxFragments=2"
            ).label("highlight"),
        )
        .order_by(func.ts_rank(ExtractedText.tsv_content, tsquery).desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )

    rows = (await db.execute(ranked_query)).all()
    results = [(row.Document, row.highlight, row.rank) for row in rows]
    return results, total


async def mark_document_for_reprocessing(db: AsyncSession, document: Document) -> Document:
    has_original = (
        await db.execute(select(OriginalImage.id).where(OriginalImage.document_id == document.id))
    ).scalar_one_or_none()

    if has_original is None:
        raise NoOriginalFileError(
            "Este documento no tiene un archivo original para reprocesar. Sube uno primero."
        )

    document.status = "reprocessing"
    await db.commit()
    await db.refresh(document)
    return document
