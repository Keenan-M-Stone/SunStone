from __future__ import annotations

import json
from pathlib import Path
from .base import Backend


class ScuffemBackend(Backend):
    name = "scuffem"

    def run(self, run_dir: Path) -> None:
        """Minimal Scuff-EM backend stub.

        Creates an `outputs/summary.json` and a small placeholder file to be
        consistent with other backends.
        """
        spec = json.loads((run_dir / "spec.json").read_text())

        out_dir = run_dir / "outputs"
        out_dir.mkdir(parents=True, exist_ok=True)

        summary = {
            "backend": self.name,
            "notes": "Stub Scuff-EM backend — translator not yet implemented.",
            "spec_keys": list(spec.keys()),
        }
        (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

        # minimal placeholder so the frontend can display an artifact
        (out_dir / "scuffem_placeholder.txt").write_text("scuffem stub output")
