from __future__ import annotations

import json
from typing import Any


def translate_spec_to_opal(spec: dict[str, Any]) -> str:
    """Produce a conservative Opal input preview from a SunStone spec.

    Returns a small textual representation suitable for previewing in the UI.
    This translator reports parsed boundary entries and warns about unsupported
    per-face PMLs or other features Opal may not represent.
    """
    domain = spec.get("domain", {})
    geom_count = len(spec.get("geometry", []) or [])

    # Reuse boundary parser for conservative reporting
    try:
        from sunstone_backend.backends.meep import parse_boundary_conditions
        pmls, bcs = parse_boundary_conditions(spec.get("boundary_conditions", []))
    except Exception:
        pmls, bcs = [], []

    warnings: list[str] = []
    if pmls:
        warnings.append("Opal does not support spatial PML layers; PML specifications will be ignored in translation.")

    # Map per-face non-PML BCs to Opal surface condition primitives. This is
    # intentionally conservative: we preserve direction/side and provide a
    # canonical condition name that downstream code can interpret or expand.
    def _map_to_opal_surface(bc_item: dict) -> dict:
        typ = bc_item.get("type")
        mapping = {"pec": "conducting", "pmc": "magnetic", "periodic": "periodic"}
        cond = mapping.get(typ, "unknown")
        return {"direction": bc_item.get("direction"), "side": bc_item.get("side"), "condition": cond, "params": bc_item.get("params", {})}

    opal_surface_conditions = [_map_to_opal_surface(b) for b in bcs]

    payload = {
        "backend": "opal",
        "domain": domain,
        "geometry_count": geom_count,
        "boundaries": {"pml_specs": pmls, "other": bcs},
        # Add explicit, translator-mapped surface conditions
        "surface_conditions": opal_surface_conditions,
        # Native Opal input fragment: surface tags + simplified conditions
        "opal_input": {
            "surface_tags": [f"surf_{s['direction']}_{s['side']}_{s['condition']}" for s in opal_surface_conditions],
            "surface_conditions": opal_surface_conditions,
        },
        "warnings": warnings,
        "note": "opal translator stub"
    }
    return json.dumps(payload, indent=2)


__all__ = ["translate_spec_to_opal"]
