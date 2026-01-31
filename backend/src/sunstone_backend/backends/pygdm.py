from __future__ import annotations

import json
from pathlib import Path
from .base import Backend


class PyGDMBackend(Backend):
    name = "pygdm"

    def run(self, run_dir: Path) -> None:
        """Minimal pyGDM backend stub.

        This creates outputs/summary.json and a tiny payload suitable for
        frontend integration and CI tests.
        """
        spec = json.loads((run_dir / "spec.json").read_text())
        # Normalize materials (non-destructive) so backends can rely on a mapping
        try:
            from sunstone_backend.util.materials import normalize_materials
            spec["materials"] = normalize_materials(spec.get("materials", {}))
        except Exception:
            # If normalization fails, leave spec as-is and let validation upstream handle it
            pass

        out_dir = run_dir / "outputs"
        out_dir.mkdir(parents=True, exist_ok=True)

        summary = {
            "backend": self.name,
            "notes": "Stub pyGDM backend — translator not yet implemented.",
            "spec_keys": list(spec.keys()),
        }
        (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

        # tiny JSON artifact
        artifacts_dir = out_dir / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        (artifacts_dir / "pygdm_meta.json").write_text(json.dumps({"ok": True}))
