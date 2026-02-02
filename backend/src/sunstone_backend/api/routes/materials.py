from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ...settings import Settings, get_settings

router = APIRouter(prefix="/materials", tags=["materials"])


def _materials_dir(settings: Settings) -> Path:
    d = settings.data_dir / "materials_db"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("", status_code=201)
def create_material(body: dict[str, Any], settings: Settings = Depends(get_settings)) -> dict:
    """Create/register a material in the server-side materials DB.

    Body should be a material dict (id optional). This is intentionally simple
    for an MVP: we persist JSON under `data_dir/materials_db/material_{id}.json`.
    """
    materials_dir = _materials_dir(settings)
    mid = body.get("id") or f"ulf_{uuid.uuid4().hex[:8]}"
    rec = dict(body)
    rec["id"] = mid
    path = materials_dir / f"material_{mid}.json"
    path.write_text(json.dumps(rec, indent=2))
    return {"id": mid, "path": str(path)}


@router.get("/{material_id}")
def get_material(material_id: str, settings: Settings = Depends(get_settings)) -> dict:
    materials_dir = _materials_dir(settings)
    path = materials_dir / f"material_{material_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="material not found")
    try:
        return json.loads(path.read_text())
    except Exception as err:
        raise HTTPException(status_code=500, detail="failed to read material") from err
