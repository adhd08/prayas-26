from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.dependencies import require_user
from app.schemas import JobAccepted, JobRequest, JobStatus


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=10) as client:
        app.state.http = client
        yield


app = FastAPI(title="Prayas API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health", tags=["infrastructure"])
async def health():
    """Process liveness only; does not claim cloud connectivity."""
    return {"status": "ok", "service": "prayas-api", "version": "0.1.0"}


@app.post("/v1/jobs", response_model=JobAccepted, status_code=202, tags=["jobs"])
async def create_job(payload: JobRequest, user_id: Annotated[str, Depends(require_user)]):
    # Wire durable persistence + a separate worker before accepting any real jobs.
    raise HTTPException(501, "Job execution is not implemented in this scaffold")


@app.get("/v1/jobs/{job_id}", response_model=JobStatus, tags=["jobs"])
async def get_job(job_id: UUID, user_id: Annotated[str, Depends(require_user)]):
    # Future lookup MUST scope the query to this verified user_id.
    raise HTTPException(501, "Job persistence is not implemented in this scaffold")
