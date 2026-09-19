from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class JobRequest(BaseModel):
    # Persist this generic envelope unchanged; pathway workers validate its contents
    # with app.pathways.inputs.PathwayParameters before calling pathway_optimizer.
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
