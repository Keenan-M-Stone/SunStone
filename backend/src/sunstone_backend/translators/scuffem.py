from __future__ import annotations

import json
from typing import Any


def translate_spec_to_scuffem(spec: dict[str, Any]) -> str:
    domain = spec.get('domain', {})
    geom = spec.get('geometry', []) or []

    # Parse boundary conditions conservatively
    try:
        from sunstone_backend.backends.meep import parse_boundary_conditions
        pmls, bcs = parse_boundary_conditions(spec.get("boundary_conditions", []))
    except Exception:
        pmls, bcs = [], []

    warnings: list[str] = []
    if pmls:
        warnings.append("Scuff-EM translator will ignore PML specifications; Scuff-EM uses different truncation/absorption approaches.")

    # Map per-face BCs into Scuff-EM surface condition entries.
    def _map_to_scuff(bc_item: dict) -> dict:
        typ = bc_item.get("type")
        mapping = {"pec": "conducting", "pmc": "magnetic", "periodic": "periodic"}
        return {"direction": bc_item.get("direction"), "side": bc_item.get("side"), "condition": mapping.get(typ, "unknown"), "params": bc_item.get("params", {})}

    scuff_surface_conditions = [_map_to_scuff(b) for b in bcs]

    return json.dumps({
        'backend': 'scuffem',
        'domain': domain,
        'geometry_count': len(geom),
        'boundaries': {"pml_specs": pmls, "other": bcs},
        # Promote mapped per-face surface conditions
        'surface_conditions': scuff_surface_conditions,
        # Native Scuff-EM fragment indicating surface tags and conditions
        'scuffem_input': {
            'surface_tags': [f"scf_{s['direction']}_{s['side']}_{s['condition']}" for s in scuff_surface_conditions],
            'surface_conditions': scuff_surface_conditions,
        },
        'warnings': warnings,
        'note': 'scuffem translator stub'
    }, indent=2)


__all__ = ["translate_spec_to_scuffem"]
