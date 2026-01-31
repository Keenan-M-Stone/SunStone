from __future__ import annotations

import json
from pathlib import Path
from .base import Backend


class OpalBackend(Backend):
    name = "opal"

    def run(self, run_dir: Path) -> None:
        """Minimal Opal backend stub.

        This does not run Opal; it creates a minimal `outputs/summary.json` and
        a placeholder artifact so the frontend can show something.
        """
        spec = json.loads((run_dir / "spec.json").read_text())
        # Normalize materials (non-destructive) so backends can rely on a mapping
        try:
            from sunstone_backend.util.materials import normalize_materials
            spec["materials"] = normalize_materials(spec.get("materials", {}))
        except Exception:
            pass

        # Create outputs dir
        out_dir = run_dir / "outputs"
        out_dir.mkdir(parents=True, exist_ok=True)

        # A minimal summary
        applied = {}
        # If translator provided native opal_input, simulate applying surface conditions
        opal_input = spec.get('opal_input') or {}
        if opal_input:
            applied['surface_tags'] = opal_input.get('surface_tags', [])
            applied['surface_conditions'] = opal_input.get('surface_conditions', [])

        summary = {
            "backend": self.name,
            "notes": "This is a stub Opal backend. Replace with a full Opal runner.",
            "spec_keys": list(spec.keys()),
            "applied": applied,
        }
        (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

        # Write a simple placeholder artifact so frontend can preview
        fields_dir = out_dir / "fields"
        fields_dir.mkdir(parents=True, exist_ok=True)
        placeholder = {
            "component": "Ez",
            "width": 24,
            "height": 24,
            "min": 0.0,
            "max": 0.0,
            "data": [0.0] * (24 * 24),
        }
        (fields_dir / "field_snapshot.json").write_text(json.dumps(placeholder))
