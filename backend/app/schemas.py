from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class JobRequest(BaseModel):
    # Domain-specific validation belongs here once the planning inputs are defined.
    parameters: dict[str, Any] = Field(default_factory=dict)


class JobAccepted(BaseModel):
    job_id: UUID
    status: Literal["queued"] = "queued"


class JobStatus(BaseModel):
    job_id: UUID
    status: Literal["queued", "running", "succeeded", "failed"]
    created_at: datetime
    result_path: str | None = None
    error: str | None = None
