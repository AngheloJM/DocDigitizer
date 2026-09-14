import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth.router import router as auth_router
from app.config import get_settings
from app.documents.router import router as documents_router
from app.documents.search_router import router as search_router
from app.folders.router import router as folders_router
from app.logging_config import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

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


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Error no controlado en %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})


@app.get("/health")
async def health_check():
    return {"status": "ok"}
