from __future__ import annotations

import os
from pathlib import Path
import json
import io
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from ...models.api import ArtifactEntry, ArtifactList
from ...settings import Settings, get_settings
from ...store import RunStore
from ...util.paths import safe_join

router = APIRouter(tags=["artifacts"])


def _store(settings: Settings) -> RunStore:
    s = RunStore(settings.data_dir)
    s.ensure()
    return s


def _iter_artifacts(run_dir: Path) -> list[ArtifactEntry]:
    artifacts: list[ArtifactEntry] = []
    for rel_root in ["outputs", "logs", "runtime"]:
        base = run_dir / rel_root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file():
                st = path.stat()
                artifacts.append(
                    ArtifactEntry(
                        path=str(path.relative_to(run_dir)),
                        size_bytes=st.st_size,
                        mtime=st.st_mtime,
                    )
                )
    artifacts.sort(key=lambda a: a.path)
    return artifacts


@router.get("/runs/{run_id}/artifacts", response_model=ArtifactList)
def list_artifacts(run_id: str, settings: Settings = Depends(get_settings)) -> ArtifactList:
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run not found")
    return ArtifactList(run_id=run_id, artifacts=_iter_artifacts(run_dir))


@router.get("/runs/{run_id}/artifacts/{path:path}")
def download_artifact(run_id: str, path: str, settings: Settings = Depends(get_settings)):
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run not found")

    try:
        resolved = safe_join(run_dir, path)
    except ValueError as err:
        raise HTTPException(status_code=400, detail="invalid path") from err

    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="artifact not found")

    return FileResponse(str(resolved), filename=os.path.basename(resolved))


@router.get("/runs/{run_id}/dispersion")
def list_dispersion(run_id: str, settings: Settings = Depends(get_settings)) -> dict:
    """List fitted dispersion artifacts for a run (if any).

    Returns a mapping material_id => parameter dict loaded from outputs/dispersion/*.json.
    """
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run not found")
    disp_dir = run_dir / "outputs" / "dispersion"
    if not disp_dir.exists():
        return {}
    out = {}
    for path in disp_dir.glob("*.json"):
        try:
            with path.open('r', encoding='utf-8') as f:
                out[path.stem] = json.load(f)
        except Exception as e:
            # skip malformed but log to stderr for diagnostics
            import logging

            logging.exception(f"Failed to load dispersion artifact {path}: {e}")
            continue
    return out


@router.get("/runs/{run_id}/dispersion/zip")
def download_dispersion_zip(run_id: str, settings: Settings = Depends(get_settings)):
    """Create and return a ZIP file containing all dispersion artifacts for a run."""
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run not found")
    disp_dir = run_dir / "outputs" / "dispersion"
    if not disp_dir.exists():
        raise HTTPException(status_code=404, detail="no dispersion artifacts")

    # Build in-memory zip
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in disp_dir.glob("*.json"):
            try:
                zf.write(path, arcname=path.name)
            except Exception:
                continue
    buf.seek(0)
    headers = {"Content-Disposition": f"attachment; filename=dispersion_run_{run_id}.zip"}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


@router.get("/runs/{run_id}/dispersion/{material_id}")
def get_dispersion(run_id: str, material_id: str, settings: Settings = Depends(get_settings)):
    store = _store(settings)
    run_dir = store.run_dir(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run not found")
    file_path = run_dir / "outputs" / "dispersion" / f"{material_id}.json"
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="dispersion not found")
    try:
        with file_path.open('r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        import logging

        logging.exception(f"Failed to read dispersion artifact {file_path}: {e}")
        raise HTTPException(status_code=500, detail="failed to read dispersion artifact")
    return data

