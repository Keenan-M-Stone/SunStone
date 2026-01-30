from __future__ import annotations

import json
from pathlib import Path
from .base import Backend


class CevicheBackend(Backend):
    name = "ceviche"

    def run(self, run_dir: Path) -> None:
        """Minimal Ceviche backend stub.

        This writes a placeholder summary so the frontend and tests can exercise
        the run/artifact contract.
        """
        spec = json.loads((run_dir / "spec.json").read_text())

        out_dir = run_dir / "outputs"
        out_dir.mkdir(parents=True, exist_ok=True)

        summary = {
            "backend": self.name,
            "notes": "Stub Ceviche backend — translator not yet implemented.",
            "spec_keys": list(spec.keys()),
        }
        (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

        # placeholder monitor CSV
        monitors_dir = out_dir / "monitors"
        monitors_dir.mkdir(parents=True, exist_ok=True)
        (monitors_dir / "placeholder.csv").write_text("t,Ez\n0.0,0.0\n")
