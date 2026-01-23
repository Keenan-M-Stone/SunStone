from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

RunStatus = Literal["created", "submitted", "running", "succeeded", "failed", "canceled"]


class RunRecord(BaseModel):
    id: str
    project_id: str
    created_at: str
    status: RunStatus
    backend: str


class StatusFile(BaseModel):
    status: RunStatus
    updated_at: str
    detail: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class JobFile(BaseModel):
    pid: int
    started_at: str
    backend: str
    mode: str
