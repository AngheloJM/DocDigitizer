import math
import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.dependencies import CurrentUser, DbSession
from app.documents import service
from app.documents.schemas import DocumentResponse, SearchResponse, SearchResultItem

router = APIRouter()


@router.get("", response_model=SearchResponse)
async def search_documents(
    db: DbSession,
    current_user: CurrentUser,
    q: str = Query(min_length=1),
    doc_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    folder_id: uuid.UUID | None = None,
    owner_id: uuid.UUID | None = None,
    page: int = 1,
    per_page: int = 20,
):
    results, total = await service.search_documents(
        db, current_user, q, doc_type, date_from, date_to, folder_id, owner_id, page, per_page
    )
    pages = math.ceil(total / per_page) if total else 0

    items = [
        SearchResultItem(document=DocumentResponse.model_validate(document), highlight=highlight, rank=rank)
        for document, highlight, rank in results
    ]

    return SearchResponse(items=items, total=total, page=page, pages=pages)
