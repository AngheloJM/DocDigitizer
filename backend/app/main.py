from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.config import get_settings
from app.documents.router import router as documents_router
from app.documents.search_router import router as search_router
from app.folders.router import router as folders_router

settings = get_settings()

app = FastAPI(title="DocDigitizer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(folders_router, prefix="/api/v1/folders", tags=["folders"])
app.include_router(documents_router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(search_router, prefix="/api/v1/search", tags=["search"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
