import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    doc_type: str | None = Field(default=None, max_length=50)
    folder_id: uuid.UUID | None = None


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    doc_type: str | None = Field(default=None, max_length=50)
    folder_id: uuid.UUID | None = None


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    doc_type: str | None
    status: str
    user_id: uuid.UUID
    folder_id: uuid.UUID | None
    created_at: datetime
    processed_at: datetime | None


class OriginalImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    file_format: str
    file_size_bytes: int
    width_px: int | None
    height_px: int | None


class GeneratedPdfResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version: int
    file_size_bytes: int


class ExtractedTextResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ocr_confidence: float | None
    ocr_engine: str
    word_count: int | None


class DocumentDetailResponse(DocumentResponse):
    original_image: OriginalImageResponse | None = None
    generated_pdf: GeneratedPdfResponse | None = None
    extracted_text: ExtractedTextResponse | None = None


class DocumentStatusResponse(BaseModel):
    status: str
    processed_at: datetime | None = None


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
    page: int
    pages: int


class DocumentUploadResponse(BaseModel):
    document_id: uuid.UUID
    task_id: str | None = None
    status: str
