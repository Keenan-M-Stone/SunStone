from __future__ import annotations

import json
from typing import Any


def translate_spec_to_pygdm(spec: dict[str, Any]) -> str:
    domain = spec.get('domain', {})
    geom = spec.get('geometry', []) or []

    try:
        from sunstone_backend.backends.meep import parse_boundary_conditions
        pmls, bcs = parse_boundary_conditions(spec.get("boundary_conditions", []))
    except Exception:
        pmls, bcs = [], []

    warnings: list[str] = []
    if pmls:
        warnings.append("pyGDM translator will ignore PMLs; pyGDM uses alternative truncation approaches.")

    def _map_to_pygdm_surface(bc_item: dict) -> dict:
        mapping = {"pec": "conducting", "pmc": "magnetic", "periodic": "periodic"}
        return {"direction": bc_item.get("direction"), "side": bc_item.get("side"), "condition": mapping.get(bc_item.get("type"), "unknown"), "params": bc_item.get("params", {})}

    pygdm_surface_conditions = [_map_to_pygdm_surface(b) for b in bcs]

    return json.dumps({
        'backend': 'pygdm',
        'domain': domain,
        'geometry_count': len(geom),
        'boundaries': {"pml_specs": pmls, "other": bcs},
        'surface_conditions': pygdm_surface_conditions,
        # pyGDM native fragment (conservative)
        'pygdm_input': {'surface_conditions': pygdm_surface_conditions},
        'warnings': warnings,
        'note': 'pyGDM translator stub'
    }, indent=2)


__all__ = ["translate_spec_to_pygdm"]
