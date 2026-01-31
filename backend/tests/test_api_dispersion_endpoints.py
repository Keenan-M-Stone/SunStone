from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
import json
import tempfile
from pathlib import Path


def test_dispersion_endpoints(tmp_path: Path):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run directory
    res = client.post('/projects', json={'name': 'disp-test'})
    project = res.json()
    spec = {'domain': {'cell_size': [1.0,1.0,0]}}
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    run = res.json()
    run_id = run['id']
    run_dir = Path(settings.data_dir) / 'runs' / f'run_{run_id}'
    disp_dir = run_dir / 'outputs' / 'dispersion'
    disp_dir.mkdir(parents=True)
    (disp_dir / 'mat-1.json').write_text(json.dumps({'eps_inf':2.0,'wp':1e16,'gamma':1e14}))

    # list
    r = client.get(f"/runs/{run_id}/dispersion")
    assert r.status_code == 200
    data = r.json()
    assert 'mat-1' in data

    # get single
    r2 = client.get(f"/runs/{run_id}/dispersion/mat-1")
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2.get('eps_inf') == 2.0
