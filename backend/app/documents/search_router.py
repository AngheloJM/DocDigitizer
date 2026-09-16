import math
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies import CurrentUser, DbSession
from app.documents import service
from app.documents.schemas import DocumentResponse, SearchResponse, SearchResultItem
from app.rate_limit import RateLimitExceededError, enforce_rate_limit

router = APIRouter()

SEARCH_MAX_ATTEMPTS = 60
SEARCH_WINDOW_SECONDS = 300


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
    try:
        await enforce_rate_limit(
            f"search_rate:{current_user.id}", SEARCH_MAX_ATTEMPTS, SEARCH_WINDOW_SECONDS
        )
    except RateLimitExceededError as error:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(error))

    results, total = await service.search_documents(
        db, current_user, q, doc_type, date_from, date_to, folder_id, owner_id, page, per_page
    )
    pages = math.ceil(total / per_page) if total else 0

    items = [
        SearchResultItem(document=DocumentResponse.model_validate(document), highlight=highlight, rank=rank)
        for document, highlight, rank in results
    ]

    return SearchResponse(items=items, total=total, page=page, pages=pages)
