from __future__ import annotations

import json
from typing import Any


def translate_spec_to_ceviche(spec: dict[str, Any]) -> str:
    """Translate a SunStone spec to a conservative Ceviche-like JSON payload.

    This is intentionally simple: it maps domain, geometry, and materials into a
    solver-friendly structure suitable for initial integration and tests.
    """
    domain = spec.get("domain", {})
    geometry = []
    for g in spec.get("geometry", []) or []:
        # Normalize a few common shapes
        if g.get("type") == "cylinder":
            geometry.append(
                {
                    "shape": "cylinder",
                    "radius": float(g.get("radius", 0.0)),
                    "height": float(g.get("height", 0.0)),
                    "center": g.get("center", [0.0, 0.0, 0.0]),
                    "material": g.get("material"),
                }
            )
        elif g.get("type") == "block":
            geometry.append(
                {
                    "shape": "block",
                    "size": g.get("size", [0.0, 0.0, 0.0]),
                    "center": g.get("center", [0.0, 0.0, 0.0]),
                    "material": g.get("material"),
                }
            )
        else:
            geometry.append({"shape": g.get("type", "unknown"), **g})

    materials = spec.get("materials", {})

    payload = {
        "backend": "ceviche",
        "domain": {
            "dimension": domain.get("dimension", "2d"),
            "cell_size": domain.get("cell_size", [1.0, 1.0, 0.0]),
            "resolution": int(domain.get("resolution", 20)),
        },
        "geometry": geometry,
        "materials": materials,
        "meta": {"translated_by": "sunstone-ceviche-translator", "version": "0.1"},
    }
    return json.dumps(payload, indent=2)


__all__ = ["translate_spec_to_ceviche"]
