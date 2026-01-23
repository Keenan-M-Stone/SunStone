from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import zarr
from zarr.storage import LocalStore

from ..util.time import utc_now_iso
from .base import Backend


class DummyBackend(Backend):
    name = "dummy"

    def _write_array(self, group: zarr.Group, name: str, data: np.ndarray) -> None:
        try:
            group.create_array(name, data=data, chunks=(512,), overwrite=True)
        except Exception:
            # Fallback for zarr API variations
            try:
                group.create_dataset(name, data=data, chunks=(512,), overwrite=True)
            except Exception:
                group.array(name, data=data, chunks=(512,), overwrite=True)

    def run(self, run_dir: Path) -> None:
        spec = json.loads((run_dir / "spec.json").read_text())

        monitors = spec.get("monitors", [])
        point_monitors = [m for m in monitors if m.get("type") == "point"]

        t = np.linspace(0.0, 2e-12, 2000, dtype=np.float64)
        freq = float(spec.get("sources", [{}])[0].get("center_freq", 3.75e14))
        decay = 7e-13
        signal = np.sin(2.0 * np.pi * freq * t) * np.exp(-t / decay)

        (run_dir / "outputs" / "monitors").mkdir(parents=True, exist_ok=True)
        for m in point_monitors:
            mid = m.get("id") or "point"
            out_path = run_dir / "outputs" / "monitors" / f"{mid}.zarr"
            store = LocalStore(str(out_path))
            root = zarr.group(store=store, overwrite=True)
            self._write_array(root, "t", t)
            self._write_array(root, "Ez", signal)

        # crude spectrum for the first point monitor
        if point_monitors:
            mid = point_monitors[0].get("id") or "point"
            dt = t[1] - t[0]
            f = np.fft.rfftfreq(t.size, d=dt)
            s = np.fft.rfft(signal)
            power = (np.abs(s) ** 2).astype(np.float64)
            (run_dir / "outputs" / "spectra").mkdir(parents=True, exist_ok=True)
            (run_dir / "outputs" / "spectra" / f"{mid}.json").write_text(
                json.dumps({"freq_hz": f.tolist(), "power": power.tolist()}, indent=2)
            )

        summary = {
            "backend": self.name,
            "created_at": utc_now_iso(),
            "monitors": {
                "point": [m.get("id") or "point" for m in point_monitors],
            },
            "notes": "Synthetic data from DummyBackend; replace with Meep backend for real runs.",
        }
        (run_dir / "outputs" / "summary.json").write_text(json.dumps(summary, indent=2))
