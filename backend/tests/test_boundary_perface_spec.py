from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
import json
from pathlib import Path


def test_submit_accepts_perface_boundary(tmp_path: Path):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project & run with per-face boundary spec
    res = client.post('/projects', json={'name': 'boundary-test'})
    project = res.json()
    spec = {
        'domain': {'cell_size': [1.0, 1.0, 0.0]},
        'boundary_conditions': [
            {'face': 'px', 'type': 'pml', 'params': {'pml_thickness': 0.2}},
            {'face': 'nx', 'type': 'pec'},
            {'face': 'py', 'type': 'pml', 'params': {'pml_thickness': 0.1}},
            {'face': 'ny', 'type': 'periodic'},
        ]
    }
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    assert res.status_code == 200
    run = res.json()
    run_id = run['id']

    # Submit with dummy backend (should accept spec even if backend doesn't support per-face)
    res2 = client.post(f"/runs/{run_id}/submit", json={'backend': 'dummy', 'mode': 'local'})
    # dummy backend runner runs quickly and returns
    assert res2.status_code == 200
    data = res2.json()
    assert data.get('status') in ('submitted', 'failed', 'pending') or 'run_id' in data
