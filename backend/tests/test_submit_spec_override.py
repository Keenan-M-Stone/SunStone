import json
from pathlib import Path
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings


def test_submit_with_spec_override_persists(tmp_path: Path):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run
    res = client.post('/projects', json={'name': 'spec-override'})
    project = res.json()
    # initial spec contains a plane monitor
    spec = {
        'monitors': [
            { 'id': 'mon1', 'type': 'plane', 'position': [0,0,0], 'size': [1,1], 'sampling': { 'mode': 'plane' }, 'orientation': 0 }
        ]
    }
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    run = res.json()
    run_id = run['id']

    run_dir = Path(settings.data_dir) / 'runs' / f'run_{run_id}'

    # Provide a spec_override with expanded point monitors
    spec_override = {
        'monitors': [
            { 'id': 'mon1_p0', 'type': 'point', 'position': [0,0,0] }
        ]
    }

    res = client.post(f"/runs/{run_id}/submit", json={'mode': 'local', 'backend': 'opal', 'spec_override': spec_override})
    assert res.status_code == 200

    # Check that spec.json now contains the overridden monitor ids
    spec_path = run_dir / 'spec.json'
    assert spec_path.exists()
    updated = json.loads(spec_path.read_text())
    assert any(m.get('id','').startswith('mon1_p0') for m in updated.get('monitors', []))
