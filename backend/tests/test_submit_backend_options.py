import json
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from pathlib import Path
from sunstone_backend.settings import get_settings


def test_submit_persists_backend_options(tmp_path: Path, monkeypatch):
    # Use a temp data dir to avoid interfering with local dev
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create a project
    res = client.post("/projects", json={"name": "t"})
    assert res.status_code == 200
    project = res.json()

    # Create run
    spec = {"domain": {"cell_size": [1.0, 1.0, 0], "resolution": 40}}
    res = client.post(f"/projects/{project['id']}/runs", json={"spec": spec})
    assert res.status_code == 200
    run = res.json()
    run_id = run["id"]

    # Submit with backend options (we expect worker launch to fail in test env,
    # but backend_options should be persisted before worker launch)
    payload = {
        "mode": "local",
        "backend": "ceviche",
        "backend_options": {"resolution": 64, "mode": "scattering"}
    }
    res = client.post(f"/runs/{run_id}/submit", json=payload)
    # Either success or failure is okay, we check file persisted
    runtime_dir = Path(settings.data_dir) / "runs" / f"run_{run_id}" / "runtime"
    backend_opts_file = runtime_dir / "backend_options.json"
    assert backend_opts_file.exists(), "backend_options.json should be written by submit handler"
    data = json.loads(backend_opts_file.read_text())
    assert data.get("resolution") == 64
    assert data.get("mode") == "scattering"
