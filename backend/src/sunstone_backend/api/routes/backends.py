from __future__ import annotations

from fastapi import APIRouter, HTTPException, Form, File, UploadFile
from typing import Any
import json


router = APIRouter(tags=["backends"])

# Minimal capability descriptions for each backend — extend as needed.
CAPABILITIES: dict[str, dict[str, Any]] = {
    "dummy": {
        "name": "dummy",
        "label": "Dummy",
        "supports_translation": False,
        "capabilities": {},
    },
    "meep": {
        "name": "meep",
        "label": "Meep (FDTD)",
        "supports_translation": False,
        "capabilities": {
            "pml_thickness": {"type": "number", "min": 0.0, "max": 10.0, "default": 0.0, "label": "PML thickness"},
            "max_time": {"type": "number", "min": 0.0, "default": 200, "label": "Max time"},
        },
    },
    "ceviche": {
        "name": "ceviche",
        "label": "Ceviche (Spectral)",
        "supports_translation": True,
        "capabilities": {
            "mode": {"type": "enum", "values": ["scattering", "eigenmode"], "default": "scattering", "label": "Mode"},
            "resolution": {"type": "number", "min": 8, "max": 500, "default": 40, "label": "Resolution"},
            "wavelength_start": {"type": "number", "min": 1e-9, "max": 1e3, "default": 0.4, "label": "Wavelength start"},
            "wavelength_stop": {"type": "number", "min": 1e-9, "max": 1e3, "default": 0.8, "label": "Wavelength stop"},
            "wavelength_points": {"type": "number", "min": 1, "max": 1000, "default": 10, "label": "Wavelength points"},
        },
        "ui": {"groups": [["mode", "resolution"], ["wavelength_start", "wavelength_stop", "wavelength_points"]], "advanced": []},
    },
    "opal": {
        "name": "opal",
        "label": "Opal (BEM)",
        "supports_translation": True,
        "capabilities": {
            "mode": {"type": "enum", "values": ["eigenmode", "scattering"], "default": "scattering", "label": "Mode"},
            "mesh_target_size": {"type": "number", "min": 1e-6, "max": 1.0, "default": 0.01, "label": "Mesh target size"},
            "solver_tolerance": {"type": "number", "min": 1e-12, "max": 1e-1, "default": 1e-6, "label": "Solver tolerance"},
            "mesh_file": {"type": "file", "accept": [".msh", ".stl"], "label": "Precomputed mesh"}
        },
    },
    "scuffem": {
        "name": "scuffem",
        "label": "Scuff-EM",
        "supports_translation": True,
        "capabilities": {
            "mesh_resolution": {"type": "number", "min": 1, "max": 100, "default": 20, "label": "Mesh resolution"},
            "frequency_sweep": {"type": "range", "fields": ["start", "stop", "points"], "label": "Frequency sweep"},
            "mesh_file": {"type": "file", "accept": [".msh", ".stl"], "label": "Precomputed mesh"}
        },
    },
    "pygdm": {
        "name": "pygdm",
        "label": "pyGDM",
        "supports_translation": True,
        "capabilities": {
            "particle_discretization": {"type": "number", "min": 1, "max": 1000, "default": 10, "label": "Particle discretization"},
            "incident_polarization": {"type": "enum", "values": ["x", "y", "z"], "default": "x", "label": "Incident polarization"},
        },
        "resource": {"supports_gpu": False, "supports_multithread": True, "supports_distributed": False, "resource_schema": {"cpu_cores": {"type": "number", "min": 1, "max": 128, "default": 1, "label": "CPU cores"}, "gpus": {"type": "number", "min": 0, "max": 8, "default": 0, "label": "GPUs"}}},
    },
} 


@router.get("/backends")
def list_backends() -> list[dict[str, Any]]:
    return [
        {"name": v["name"], "label": v.get("label", v["name"]) } for v in CAPABILITIES.values()
    ]


@router.get("/backends/{name}")
def get_backend_capabilities(name: str) -> dict[str, Any]:
    key = name.strip().lower()
    if key not in CAPABILITIES:
        raise HTTPException(status_code=404, detail="Unknown backend")
    return CAPABILITIES[key]


@router.post("/backends/{name}/translate")
def translate_backend(name: str, spec: dict[str, Any]) -> dict[str, Any]:
    key = name.strip().lower()
    if key not in CAPABILITIES:
        raise HTTPException(status_code=404, detail="Unknown backend")

    # Use server-side translators where available
    try:
        if key == 'ceviche':
            from ...translators.ceviche import translate_spec_to_ceviche
            out = translate_spec_to_ceviche(spec)
            # ceviche translator returns JSON string; parse to object
            try:
                payload = json.loads(out)
            except Exception:
                payload = out
            return {"backend": key, "translated": payload, "warnings": []}
        if key == 'opal':
            from ...translators.opal import translate_spec_to_opal
            out = translate_spec_to_opal(spec)
            return {"backend": key, "translated": out, "warnings": []}
        if key == 'scuffem':
            from ...translators.scuffem import translate_spec_to_scuffem
            out = translate_spec_to_scuffem(spec)
            try:
                payload = json.loads(out)
            except Exception:
                payload = out
            return {"backend": key, "translated": payload, "warnings": []}
        if key == 'pygdm':
            from ...translators.pygdm import translate_spec_to_pygdm
            out = translate_spec_to_pygdm(spec)
            try:
                payload = json.loads(out)
            except Exception:
                payload = out
            return {"backend": key, "translated": payload, "warnings": []}
        # No translator implemented for meep/dummy etc.
        return {"backend": key, "translated": None, "warnings": ["No server-side translator available for this backend"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {e}") from e


@router.post("/backends/{name}/translate-multipart")
def translate_backend_multipart(name: str, spec: str | None = Form(None), mesh: UploadFile | None = File(None)):
    key = name.strip().lower()
    if key not in CAPABILITIES:
        raise HTTPException(status_code=404, detail="Unknown backend")

    # spec is expected as a JSON string in form 'spec'
    try:
        spec_obj = json.loads(spec) if isinstance(spec, str) and spec else {}
    except Exception:
        raise HTTPException(status_code=400, detail="Spec JSON invalid")

    # Basic validation: if backend declares mesh_file and no mesh provided, add a warning
    warnings: list[str] = []
    caps = CAPABILITIES.get(key, {})
    if caps.get('capabilities', {}).get('mesh_file') and mesh is None:
        warnings.append('Backend expects a mesh file; none provided. Auto-meshing may be required.')

    # For testing, accept mesh file metadata and return it in the translated payload
    mesh_info = None
    try:
        if mesh is not None:
            # mesh is a Starlette UploadFile; extract filename and size
            filename = getattr(mesh, 'filename', None)
            content = mesh.file.read() if hasattr(mesh, 'file') else None
            size = len(content) if content is not None else None
            mesh_info = {'filename': filename, 'size': size}
    except Exception:
        warnings.append('Failed to read uploaded mesh')

    # Delegate to usual translator, if available
    translated_result = None
    try:
        res = translate_backend(name, spec_obj)
        translated_result = res.get('translated')
    except HTTPException:
        translated_result = None

    payload = {
        'backend': key,
        'translated': translated_result,
        'mesh': mesh_info,
        'warnings': warnings,
    }
    return payload
