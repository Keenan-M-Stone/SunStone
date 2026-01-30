from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from typing import Iterator
import json
import time

from ...settings import get_settings
from ...store import RunStore

router = APIRouter(tags=["metrics"])


def _store(settings):
    s = RunStore(settings.data_dir)
    s.ensure()
    return s


@router.get("/runs/{run_id}/metrics")
def get_run_metrics(run_id: str):
    settings = get_settings()
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    path = run_dir / "runtime" / "resource.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="No metrics available for this run")
    try:
        data = json.loads(path.read_text())
        return JSONResponse(content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read metrics: {e}") from e


@router.get("/runs/{run_id}/metrics/stream")
def stream_run_metrics(run_id: str):
    settings = get_settings()
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    path = run_dir / "runtime" / "resource.json"

    if not path.exists():
        raise HTTPException(status_code=404, detail="No metrics available for this run")

    def iter_file() -> Iterator[bytes]:
        last_size = 0
        while True:
            try:
                text = path.read_text()
                if len(text) > last_size:
                    last_size = len(text)
                    yield text.encode("utf-8")
            except Exception:
                pass
            time.sleep(0.5)

    return StreamingResponse(iter_file(), media_type="application/json")


@router.get("/metrics/hosts")
def get_hosts_metrics():
    # Return a snapshot of host resources
    import psutil
    try:
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        data = {
            "cpu_percent": cpu,
            "memory_total": mem.total,
            "memory_available": mem.available,
        }
        # GPU info if available
        try:
            import GPUtil
            gpus = GPUtil.getGPUs()
            data["gpus"] = [
                {"id": g.id, "name": g.name, "load": g.load, "memory_total": getattr(g, "memoryTotal", None), "memory_used": getattr(g, "memoryUsed", None)}
                for g in gpus
            ]
        except Exception:
            data["gpus"] = None
        return JSONResponse(content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sample host metrics: {e}") from e
