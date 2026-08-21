from fastapi import FastAPI

from app.auth.router import router as auth_router

app = FastAPI(title="DocDigitizer API", version="1.0.0")

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
