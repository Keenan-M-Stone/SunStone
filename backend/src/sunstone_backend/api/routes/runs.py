
from __future__ import annotations
from ...settings import Settings, get_settings

from fastapi.responses import JSONResponse
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(tags=["runs"])

@router.get("/runs/{run_id}/resource")
def get_resource(run_id: str, settings: Settings = Depends(get_settings)):
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    resource_path = run_dir / "runtime" / "resource.json"
    if not resource_path.exists():
        return JSONResponse(content=[])
    try:
        with open(resource_path) as f:
            data = json.load(f)
        return JSONResponse(content=data)
    except Exception:
        return JSONResponse(content=[])


import json

from ...hardware import detect_environment
from ...jobs import LocalJobRunner
from ...models.api import CreateRunRequest, SubmitRunRequest, SubmitRunResponse
from ...models.run import JobFile, RunRecord, StatusFile

from ...settings import Settings, get_settings
from ...store import RunStore
from ...util.time import utc_now_iso

router = APIRouter(tags=["runs"])


def _store(settings: Settings) -> RunStore:
    s = RunStore(settings.data_dir)
    s.ensure()
    return s


@router.post("/projects/{project_id}/runs", response_model=RunRecord)
def create_run(
    project_id: str,
    req: CreateRunRequest,
    settings: Settings = Depends(get_settings),
) -> RunRecord:
    store = _store(settings)
    backend = settings.default_backend
    try:
        return store.create_run(project_id=project_id, spec=req.spec, backend=backend)
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail="project not found") from err


@router.get("/runs/{run_id}", response_model=RunRecord)
def get_run(run_id: str, settings: Settings = Depends(get_settings)) -> RunRecord:
    store = _store(settings)
    try:
        return store.load_run(run_id)
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail="run not found") from err


@router.post("/runs/{run_id}/submit", response_model=SubmitRunResponse)
def submit_run(
    run_id: str,
    req: SubmitRunRequest,
    settings: Settings = Depends(get_settings),
) -> SubmitRunResponse:
    if req.mode != "local":
        raise HTTPException(status_code=400, detail="only local mode is implemented in v0")
    if not settings.allow_local_execution:
        raise HTTPException(status_code=403, detail="local execution disabled")

    store = _store(settings)
    try:
        run = store.load_run(run_id)
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail="run not found") from err

    run_dir = store.run_dir(run_id)
    backend = (req.backend or run.backend).strip().lower()

    # Environment snapshot
    (run_dir / "runtime" / "environment.json").write_text(
        json.dumps(detect_environment(), indent=2)
    )

    # Launch worker with error handling
    try:
        runner = LocalJobRunner()
        job = runner.submit(
            run=run,
            run_dir=run_dir,
            backend=backend,
            python_executable=req.python_executable,
        )
        (run_dir / "runtime" / "job.json").write_text(job.model_dump_json(indent=2))
        # Mark submitted only if worker launch succeeded
        run.status = "submitted"
        store.save_run(run)
        store.save_status(run_id, StatusFile(status="submitted", updated_at=utc_now_iso()))
        return SubmitRunResponse(run_id=run_id, status=run.status)
    except Exception as e:
        # Log error to stderr.log
        log_path = run_dir / "logs" / "stderr.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, "a") as f:
            f.write(f"[submit_run] Worker launch failed: {e}\n")
        # Set status to failed with detail
        run.status = "failed"
        store.save_run(run)
        store.save_status(run_id, StatusFile(status="failed", updated_at=utc_now_iso(), detail=f"Worker launch failed: {e}"))
        raise HTTPException(status_code=500, detail=f"Worker launch failed: {e}")


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str, settings: Settings = Depends(get_settings)) -> dict:
    store = _store(settings)
    run_dir = store.run_dir(run_id)

    try:
        run = store.load_run(run_id)
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail="run not found") from err

    job_path = run_dir / "runtime" / "job.json"
    if not job_path.exists():
        raise HTTPException(status_code=400, detail="run not submitted")

    job = JobFile.model_validate_json(job_path.read_text())
    LocalJobRunner().cancel(job)

    run.status = "canceled"
    store.save_run(run)
    store.save_status(run_id, StatusFile(status="canceled", updated_at=utc_now_iso()))

    return {"ok": True}


@router.get("/runs/{run_id}/logs")
def get_logs(
    run_id: str,
    stream: str = "stdout",
    tail_lines: int = 200,
    settings: Settings = Depends(get_settings),
) -> dict:
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    path = run_dir / "logs" / ("stderr.log" if stream == "stderr" else "stdout.log")
    if not path.exists():
        return {"run_id": run_id, "stream": stream, "text": ""}

    # Efficient tail
    lines: list[bytes] = []
    with path.open("rb") as f:
        f.seek(0, 2)
        end = f.tell()
        block = 8192
        buf = b""
        pos = end
        while pos > 0 and len(lines) <= tail_lines:
            read_size = block if pos >= block else pos
            pos -= read_size
            f.seek(pos)
            buf = f.read(read_size) + buf
            lines = buf.splitlines()[-tail_lines:]
    text = "\n".join(line.decode("utf-8", errors="replace") for line in lines)
    return {"run_id": run_id, "stream": stream, "text": text}
