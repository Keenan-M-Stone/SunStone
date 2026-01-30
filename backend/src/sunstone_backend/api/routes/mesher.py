from __future__ import annotations

from fastapi import APIRouter, HTTPException
from typing import Any
import json

router = APIRouter(tags=["mesher"])


@router.post("/mesher")
def generate_mesh(spec: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    """Coarse server-side mesh generator: fan triangulation for polygons and simple cylinders/blocks.

    This is intentionally conservative — for production-quality meshing, integrate a
    dedicated mesher (Triangle, TetGen, Gmsh) or call a meshing service.
    """
    try:
        polys = []
        for g in spec.get('geometry', []) or []:
            if g.get('shape') == 'polygon' and g.get('points'):
                polys.append([(float(p[0]), float(p[1])) for p in g['points']])
            elif g.get('type') == 'block':
                size = g.get('size', [0, 0, 0])
                c = g.get('center', [0, 0, 0])
                hw = float(size[0]) / 2.0
                hh = float(size[1]) / 2.0
                polys.append([(c[0] - hw, c[1] - hh), (c[0] + hw, c[1] - hh), (c[0] + hw, c[1] + hh), (c[0] - hw, c[1] + hh)])
            elif g.get('type') == 'cylinder':
                r = float(g.get('radius', 0.1))
                c = g.get('center', [0, 0, 0])
                n = max(12, int((options or {}).get('density', 1) * 12))
                pts = []
                for i in range(n):
                    theta = (i / n) * 2 * 3.141592653589793
                    pts.append((c[0] + r * __import__('math').cos(theta), c[1] + r * __import__('math').sin(theta)))
                polys.append(pts)
        # Fan triangulation per polygon
        tri_count = 0
        obj_lines = []
        v_idx = 1
        for poly in polys:
            if len(poly) < 3:
                continue
            # vertices
            for x, y in poly:
                obj_lines.append(f"v {x} {y} 0")
            for i in range(1, len(poly) - 1):
                a = v_idx
                b = v_idx + i
                c = v_idx + i + 1
                obj_lines.append(f"f {a} {b} {c}")
                tri_count += 1
            v_idx += len(poly)
        obj_text = "\n".join(obj_lines)
        return {"mesh": obj_text, "triangles": tri_count, "warnings": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Meshing failed: {e}") from e