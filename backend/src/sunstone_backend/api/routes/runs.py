
from __future__ import annotations

import json
from ...hardware import detect_environment
from ...jobs import LocalJobRunner
from ...models.api import CreateRunRequest, SubmitRunRequest, SubmitRunResponse
from ...models.run import JobFile, RunRecord, StatusFile

from ...settings import Settings, get_settings
from ...store import RunStore
from ...util.time import utc_now_iso

from fastapi.responses import JSONResponse
from fastapi import APIRouter, Depends, HTTPException, Request

router = APIRouter(tags=["runs"])


def _store(settings: Settings) -> RunStore:
    s = RunStore(settings.data_dir)
    s.ensure()
    return s


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
    # Support different modes. Local mode will launch a local worker; ssh/slurm modes are recorded
    # and set to submitted, but actual cluster integration is not implemented in v0.
    if req.mode not in ("local", "ssh", "slurm"):
        raise HTTPException(status_code=400, detail="unsupported mode")
    if req.mode == "local" and not settings.allow_local_execution:
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

    # Persist backend-specific options (if provided) to the run runtime so workers can use them
    # Basic validation against known capability schemas if available
    from .backends import CAPABILITIES as _CAPS  # local import to avoid circular issues
    caps = _CAPS.get(backend, {})
    cap_opts = caps.get('capabilities', {})

    # Validate run spec items (basic checks against backend declared capabilities)
    # Use spec stored in the run directory (SubmitRunRequest does not include spec)
    spec_path = run_dir / 'spec.json'
    if spec_path.exists():
        try:
            spec = json.loads(spec_path.read_text())
        except Exception:
            spec = {}
    else:
        spec = {}
    # boundary_conditions: list of {type, params}
    if 'boundary_conditions' in spec:
        bcs = spec.get('boundary_conditions')
        # Allow either a single object (global BC) or a list of per-face BCs
        allowed_bcs = caps.get('boundary_types', [])
        if isinstance(bcs, dict):
            if 'type' not in bcs:
                raise HTTPException(status_code=400, detail='boundary_conditions object must have a "type"')
            if bcs['type'] not in allowed_bcs:
                raise HTTPException(status_code=400, detail=f'Boundary type "{bcs["type"]}" not supported by backend {backend}')
        elif isinstance(bcs, list):
            for i, bc in enumerate(bcs):
                if not isinstance(bc, dict) or 'type' not in bc:
                    raise HTTPException(status_code=400, detail=f'boundary_conditions[{i}] must be an object with a "type"')
                if bc['type'] not in allowed_bcs:
                    raise HTTPException(status_code=400, detail=f'Boundary type "{bc["type"]}" not supported by backend {backend}')
                # Optional face validation
                if 'face' in bc and bc['face'] not in ('px','nx','py','ny','pz','nz'):
                    raise HTTPException(status_code=400, detail=f'boundary_conditions[{i}].face must be one of px,nx,py,ny,pz,nz')
        else:
            raise HTTPException(status_code=400, detail='boundary_conditions must be an object or a list')

    # materials: accept either dict mapping (bundle style) or list of material definitions
    if 'materials' in spec:
        # Normalize to a mapping name -> info using shared util (non-destructive)
        try:
            from sunstone_backend.util.materials import normalize_materials as _normalize_materials
            materials_map = _normalize_materials(spec.get('materials'))
        except Exception:
            raise HTTPException(status_code=400, detail='materials must be an object or a list')

        # Build lightweight entries for validation without coercing values
        normalized_entries: list[dict] = []
        for name, info in materials_map.items():
            if not isinstance(info, dict):
                raise HTTPException(status_code=400, detail=f'materials["{name}"] must be an object')
            model = str(info.get('model') or info.get('type') or '').lower()
            mtype = 'isotropic' if model in ('', 'constant', 'isotropic') else model
            normalized_entries.append({'name': name, 'type': mtype})

        # Validate material models against backend capabilities
        allowed_mat = caps.get('material_models', [])
        for m in normalized_entries:
            mtype = m.get('type', 'isotropic')
            if mtype not in allowed_mat:
                raise HTTPException(status_code=400, detail=f'Material "{m.get("name")}" type "{mtype}" not supported by backend {backend}')

        # Persist normalized (mapping) materials back into the run's spec.json so workers
        # always receive a consistent mapping representation. This write is non-destructive
        # because normalize_materials only renames keys and copies values; complex
        # structures are preserved.
        spec['materials'] = materials_map
        try:
            spec_path.write_text(json.dumps(spec, indent=2))
        except Exception:
            raise HTTPException(status_code=500, detail='Failed to persist normalized materials to run spec')

    # sources: list of source definitions
    if 'sources' in spec:
        srcs = spec.get('sources')
        if not isinstance(srcs, list):
            raise HTTPException(status_code=400, detail='sources must be a list')
        allowed_src = caps.get('source_types', [])
        for i, s in enumerate(srcs):
            if not isinstance(s, dict) or 'type' not in s:
                raise HTTPException(status_code=400, detail=f'sources[{i}] must be an object with a "type"')
            if s['type'] not in allowed_src:
                raise HTTPException(status_code=400, detail=f'Source type "{s["type"]}" not supported by backend {backend}')

    if req.backend_options is not None:
        for k, v in (req.backend_options or {}).items():
            sch = cap_opts.get(k)
            if sch is None:
                raise HTTPException(status_code=400, detail=f"Unknown backend option: {k}")
            t = sch.get('type')
            if t == 'number' and not isinstance(v, (int, float)):
                raise HTTPException(status_code=400, detail=f"Option {k} must be numeric")
            if t == 'enum' and v not in sch.get('values', []):
                raise HTTPException(status_code=400, detail=f"Option {k} must be one of {sch.get('values')}")
            if t == 'range':
                if not isinstance(v, dict) or any(f not in v for f in (sch.get('fields') or [])):
                    raise HTTPException(status_code=400, detail=f"Option {k} must be an object with fields {sch.get('fields')}")
        (run_dir / "runtime" / "backend_options.json").write_text(json.dumps(req.backend_options, indent=2))

    # Launch worker or record submission depending on mode
    if req.mode == "local":
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
    else:
        # For ssh/slurm we attempt to scaffold a remote runner; for ssh we build an SSH runner record
        if req.mode == 'ssh':
            try:
                from ...jobs import SSHJobRunner
                runner = SSHJobRunner()
                job = runner.submit_ssh(run=run, run_dir=run_dir, backend=backend, ssh_target=req.ssh_target or '', python_executable=req.python_executable)
                # Persist job.json with remote metadata
                job_obj = job.model_dump()
                job_obj['ssh_target'] = req.ssh_target
                job_obj['ssh_options'] = req.ssh_options
                job_obj['mode'] = 'ssh'
                # If runner provided remote_path metadata, persist it for diagnostics
                if getattr(job, '_remote_path', None):
                    job_obj['remote_path'] = getattr(job, '_remote_path')
                if getattr(job, '_ssh_port', None):
                    job_obj['ssh_port'] = getattr(job, '_ssh_port')
                if getattr(job, '_identity_file', None):
                    job_obj['identity_file'] = getattr(job, '_identity_file')
                (run_dir / "runtime" / "job.json").write_text(json.dumps(job_obj, indent=2))
                run.status = "submitted"
                store.save_run(run)
                store.save_status(run_id, StatusFile(status="submitted", updated_at=utc_now_iso(), detail=f"Recorded ssh submission"))
                return SubmitRunResponse(run_id=run_id, status=run.status)
            except Exception as e:
                # fall back to recording
                job = {
                    "pid": 0,
                    "started_at": utc_now_iso(),
                    "backend": backend,
                    "mode": req.mode,
                    "ssh_target": req.ssh_target,
                    "ssh_options": req.ssh_options,
                }
                (run_dir / "runtime" / "job.json").write_text(json.dumps(job, indent=2))
                run.status = "submitted"
                store.save_run(run)
                store.save_status(run_id, StatusFile(status="submitted", updated_at=utc_now_iso(), detail=f"Recorded {req.mode} submission (fallback)"))
                return SubmitRunResponse(run_id=run_id, status=run.status)
        else:
            # slurm: record submission for now
            job = {
                "pid": 0,
                "started_at": utc_now_iso(),
                "backend": backend,
                "mode": req.mode,
            }
            (run_dir / "runtime" / "job.json").write_text(json.dumps(job, indent=2))
            run.status = "submitted"
            store.save_run(run)
            store.save_status(run_id, StatusFile(status="submitted", updated_at=utc_now_iso(), detail=f"Recorded {req.mode} submission"))
            return SubmitRunResponse(run_id=run_id, status=run.status)


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

    # Read raw job metadata so we can handle ssh-mode cancellations which require ssh_target
    try:
        job_meta = json.loads(job_path.read_text())
    except Exception:
        raise HTTPException(status_code=500, detail="failed to read job metadata")

    try:
        if job_meta.get("mode") == "ssh":
            from ...jobs import SSHJobRunner

            SSHJobRunner().cancel(job_meta)
        else:
            job = JobFile.model_validate_json(json.dumps(job_meta))
            LocalJobRunner().cancel(job)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to cancel job: {e}") from e

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


@router.get("/runs/{run_id}/job")
def get_run_job(run_id: str, settings: Settings = Depends(get_settings)) -> dict:
    """Return runtime/job.json for a run if present."""
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    job_path = run_dir / "runtime" / "job.json"
    if not job_path.exists():
        raise HTTPException(status_code=404, detail="job info not available")
    try:
        return json.loads(job_path.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to read job: {e}") from e


@router.get("/runs/{run_id}/job/status")
def get_run_job_status(run_id: str, settings: Settings = Depends(get_settings)) -> dict:
    """Return runtime job status; for ssh-run jobs attempt to probe the remote PID."""
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    job_path = run_dir / "runtime" / "job.json"
    if not job_path.exists():
        raise HTTPException(status_code=404, detail="job info not available")
    try:
        job_meta = json.loads(job_path.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to read job: {e}") from e

    if job_meta.get("mode") == "ssh":
        pid = int(job_meta.get("pid", 0))
        ssh_target = job_meta.get("ssh_target")
        if pid > 0 and ssh_target:
            try:
                from ...jobs import SSHJobRunner
                runner = SSHJobRunner()
                running = runner.check_remote_pid(ssh_target, pid, port=job_meta.get("ssh_port"), identity_file=job_meta.get("identity_file"))
                return {"mode": "ssh", "pid": pid, "ssh_target": ssh_target, "remote_path": job_meta.get("remote_path"), "running": running}
            except Exception as e:
                return {"mode": "ssh", "pid": pid, "ssh_target": ssh_target, "remote_path": job_meta.get("remote_path"), "running": False, "error": str(e)}
        else:
            return {"mode": "ssh", "pid": pid, "ssh_target": ssh_target, "remote_path": job_meta.get("remote_path"), "running": False}
    else:
        # For local or recorded runs we cannot probe reliably here; return stored metadata
        return {"mode": job_meta.get("mode"), "pid": job_meta.get("pid"), "running": None}


@router.get("/runs/{run_id}/job/stream")
async def stream_run_job(run_id: str, request: Request, interval: float = 1.0, max_events: int | None = None, settings: Settings = Depends(get_settings)):
    """Stream JSON-formatted job status and resource snapshots as Server-Sent Events (SSE).

    Query parameters:
    - `interval` controls sampling interval in seconds (useful for tests).
    - `max_events` if set will stop the stream after that many events (useful for deterministic tests).
    """
    import asyncio
    from fastapi.responses import StreamingResponse

    store = _store(settings)
    run_dir = store.run_dir(run_id)
    job_path = run_dir / "runtime" / "job.json"
    if not job_path.exists():
        raise HTTPException(status_code=404, detail="job info not available")

    async def event_generator():
        sent = 0
        while True:
            if await request.is_disconnected():
                break
            try:
                job_meta = json.loads(job_path.read_text())
            except Exception:
                job_meta = {}

            running = None
            if job_meta.get("mode") == "ssh":
                pid = int(job_meta.get("pid", 0))
                ssh_target = job_meta.get("ssh_target")
                if pid > 0 and ssh_target:
                    try:
                        from ...jobs import SSHJobRunner
                        runner = SSHJobRunner()
                        running = await asyncio.to_thread(runner.check_remote_pid, ssh_target, pid, job_meta.get("ssh_port"), job_meta.get("identity_file"))
                    except Exception:
                        running = False
                else:
                    running = False

            # Resource snapshot if available
            resource = None
            try:
                rpath = run_dir / "runtime" / "resource.json"
                if rpath.exists():
                    with open(rpath) as f:
                        resource = json.load(f)
            except Exception:
                resource = None

            payload = {
                "timestamp": utc_now_iso(),
                "job": job_meta,
                "running": running,
                "resource": resource,
            }
            try:
                yield f"data: {json.dumps(payload)}\n\n"
            except Exception:
                break

            sent += 1
            if max_events is not None and sent >= int(max_events):
                break

            # Sleep for sampling interval
            try:
                await asyncio.sleep(max(0.05, float(interval)))
            except Exception:
                break

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/runs/{run_id}/job/cancel")
def cancel_run_job(run_id: str, settings: Settings = Depends(get_settings)) -> dict:
    """Cancel the job and return the new status. Uses SSHJobRunner for ssh-mode jobs."""
    store = _store(settings)
    run_dir = store.run_dir(run_id)

    try:
        run = store.load_run(run_id)
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail="run not found") from err

    job_path = run_dir / "runtime" / "job.json"
    if not job_path.exists():
        raise HTTPException(status_code=400, detail="run not submitted")

    try:
        job_meta = json.loads(job_path.read_text())
    except Exception:
        raise HTTPException(status_code=500, detail="failed to read job metadata")

    try:
        if job_meta.get("mode") == "ssh":
            from ...jobs import SSHJobRunner
            SSHJobRunner().cancel(job_meta)
        else:
            job = JobFile.model_validate_json(json.dumps(job_meta))
            LocalJobRunner().cancel(job)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to cancel job: {e}") from e

    run.status = "canceled"
    store.save_run(run)
    store.save_status(run_id, StatusFile(status="canceled", updated_at=utc_now_iso()))

    return {"ok": True}
