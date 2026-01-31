from __future__ import annotations

from fastapi import APIRouter, File, UploadFile, HTTPException
from typing import Any
import uuid
import os
from pathlib import Path

router = APIRouter(tags=["meshes"])

MESH_DIR = Path(os.environ.get("SUNSTONE_MESH_DIR", ".sunstone/meshes"))
MESH_DIR.mkdir(parents=True, exist_ok=True)

@router.post('/meshes')
def upload_mesh(mesh: UploadFile = File(...)) -> dict[str, Any]:
    if mesh is None:
        raise HTTPException(status_code=400, detail='no file')
    mid = uuid.uuid4().hex
    fname = f"{mid}_{mesh.filename}"
    dest = MESH_DIR / fname
    try:
        content = mesh.file.read()
        dest.write_bytes(content)
        meta = {'id': mid, 'filename': mesh.filename, 'size': len(content)}
        # store metadata
        (MESH_DIR / f"{mid}.json").write_text(str(meta))
        return {'id': mid, 'filename': mesh.filename, 'size': len(content)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@router.get('/meshes/{mesh_id}')
def get_mesh(mesh_id: str) -> dict[str, Any]:
    meta_path = MESH_DIR / f"{mesh_id}.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail='mesh not found')
    try:
        # meta is str repr; we stored previously
        txt = meta_path.read_text()
        # eval-ish (it's a dict literal); for safety, return filename and size from stored file name
        # Simplest: find content file by prefix match
        files = [p for p in MESH_DIR.iterdir() if p.name.startswith(mesh_id + '_')]
        if not files:
            raise HTTPException(status_code=404, detail='mesh file missing')
        file = files[0]
        return {'id': mesh_id, 'filename': file.name.split('_',1)[1], 'size': file.stat().st_size}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@router.get('/meshes/{mesh_id}/qc')
def mesh_qc(mesh_id: str) -> dict[str, Any]:
    files = [p for p in MESH_DIR.iterdir() if p.name.startswith(mesh_id + '_')]
    if not files:
        raise HTTPException(status_code=404, detail='mesh not found')
    file = files[0]
    try:
        text = file.read_text(errors='ignore')
        stats = {}
        if file.suffix.lower() in ('.obj',):
            v = sum(1 for l in text.splitlines() if l.strip().startswith('v '))
            f = sum(1 for l in text.splitlines() if l.strip().startswith('f '))
            stats = {'format': 'obj', 'vertices': v, 'faces': f}
        elif file.suffix.lower() in ('.stl',):
            t = sum(1 for l in text.splitlines() if l.strip().lower().startswith('facet normal'))
            stats = {'format': 'stl', 'triangles': t}
        else:
            stats = {'format': 'unknown', 'size_bytes': file.stat().st_size}
        return {'id': mesh_id, 'qc': stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
