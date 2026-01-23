from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ProjectRecord(BaseModel):
    id: str
    name: str
    created_at: str


class CreateRunRequest(BaseModel):
    spec: dict


class SubmitRunRequest(BaseModel):
    mode: Literal["local", "ssh", "slurm"] = "local"
    backend: str | None = None
    python_executable: str | None = Field(
        default=None,
        description=(
            "Optional path to a Python interpreter to run the worker "
            "(useful for solver-specific envs)."
        ),
    )


class SubmitRunResponse(BaseModel):
    run_id: str
    status: str


class ArtifactEntry(BaseModel):
    path: str
    size_bytes: int
    mtime: float


class ArtifactList(BaseModel):
    run_id: str
    artifacts: list[ArtifactEntry]
