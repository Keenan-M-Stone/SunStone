from __future__ import annotations

import json
from pathlib import Path

from sunstone_backend.store import RunStore


def test_create_project_and_run(tmp_path: Path) -> None:
    store = RunStore(tmp_path)
    proj = store.create_project("p1")
    assert proj["id"]

    spec = {"version": "0.1", "monitors": [{"type": "point", "id": "E0"}]}
    run = store.create_run(project_id=proj["id"], spec=spec, backend="dummy")

    run_dir = store.run_dir(run.id)
    assert (run_dir / "spec.json").exists()
    assert json.loads((run_dir / "spec.json").read_text())["version"] == "0.1"

    status = store.load_status(run.id)
    assert status.status == "created"
