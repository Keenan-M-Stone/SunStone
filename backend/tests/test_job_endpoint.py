import json
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
from pathlib import Path


def test_get_job_endpoint(tmp_path: Path):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project & run
    res = client.post('/projects', json={'name': 'jobtest'})
    assert res.status_code == 200
    project = res.json()
    spec = {'domain': {'cell_size': [1.0, 1.0, 0], 'resolution': 10}}
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    assert res.status_code == 200
    run = res.json()
    run_id = run['id']

    runtime = Path(settings.data_dir) / 'runs' / f'run_{run_id}' / 'runtime'
    runtime.mkdir(parents=True, exist_ok=True)
    job = {'pid': 12345, 'started_at': 'now', 'backend': 'dummy', 'mode': 'local'}
    (runtime / 'job.json').write_text(json.dumps(job))

    res = client.get(f"/runs/{run_id}/job")
    assert res.status_code == 200
    data = res.json()
    assert data['pid'] == 12345
    assert data['backend'] == 'dummy'
