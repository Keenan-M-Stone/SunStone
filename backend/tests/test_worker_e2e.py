import json
from pathlib import Path
from sunstone_backend.worker import main as worker_main
from sunstone_backend.api.app import create_app
from fastapi.testclient import TestClient
from sunstone_backend.settings import get_settings


def test_worker_runs_backend_stub(tmp_path: Path):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run
    res = client.post('/projects', json={'name': 'e2e'})
    project = res.json()
    spec = {'domain': {'cell_size': [1.0, 1.0, 0], 'resolution': 30}}
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    run = res.json()
    run_id = run['id']

    run_dir = Path(settings.data_dir) / 'runs' / f'run_{run_id}'
    # Write a simple backend options
    (run_dir / 'runtime').mkdir(parents=True, exist_ok=True)
    (run_dir / 'runtime' / 'backend_options.json').write_text(json.dumps({'mode': 'scattering', 'resolution': 64}))

    # Call the worker directly with backend 'ceviche' (stub) and ensure outputs exist
    worker_main(run_dir=run_dir, backend='ceviche')

    out = run_dir / 'outputs' / 'summary.json'
    assert out.exists()
    data = json.loads(out.read_text())
    assert data.get('backend') == 'ceviche'
