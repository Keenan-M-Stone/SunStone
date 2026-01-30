import json
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
from pathlib import Path
import subprocess
from unittest.mock import MagicMock


def test_cancel_run_ssh_invokes_remote_kill(tmp_path: Path, monkeypatch):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project
    res = client.post("/projects", json={"name": "t"})
    assert res.status_code == 200
    project = res.json()

    # Create run
    spec = {"domain": {"cell_size": [1.0, 1.0, 0], "resolution": 40}}
    res = client.post(f"/projects/{project['id']}/runs", json={"spec": spec})
    assert res.status_code == 200
    run = res.json()
    run_id = run["id"]

    # Write job.json with ssh metadata
    runtime_dir = Path(settings.data_dir) / "runs" / f"run_{run_id}" / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    job = {"pid": 2222, "ssh_target": "alice@remote:/tmp/sr", "mode": "ssh"}
    (runtime_dir / "job.json").write_text(json.dumps(job))

    calls = []

    def fake_run(cmd, check, stdout, stderr, timeout=None, **kwargs):
        calls.append(cmd)
        m = MagicMock()
        m.returncode = 0
        return m

    monkeypatch.setattr(subprocess, 'run', fake_run)

    res = client.post(f"/runs/{run_id}/cancel")
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    # Verify ssh kill was attempted
    assert any(call[0] == 'ssh' and any('kill -TERM' in str(c) for c in call) for call in calls)
