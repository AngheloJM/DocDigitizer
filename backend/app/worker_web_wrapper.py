import subprocess
from contextlib import asynccontextmanager

from fastapi import FastAPI

_worker_process: subprocess.Popen | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _worker_process
    _worker_process = subprocess.Popen(
        [
            "celery",
            "-A",
            "app.worker.celery_app",
            "worker",
            "--loglevel=info",
            "--concurrency=1",
            "--pool=solo",
        ]
    )
    yield
    if _worker_process is not None:
        _worker_process.terminate()


app = FastAPI(title="DocDigitizer Worker Wrapper", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    alive = _worker_process is not None and _worker_process.poll() is None
    return {"status": "ok" if alive else "worker_down"}
