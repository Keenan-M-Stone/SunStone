import json
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
from pathlib import Path
import time


def test_metrics_endpoint_returns_samples(tmp_path: Path):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # create project & run
    res = client.post('/projects', json={'name': 'm'})
    project = res.json()
    spec = {'domain': {'cell_size': [1.0, 1.0, 0], 'resolution': 10}}
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    run = res.json()
    run_id = run['id']

    # write a small resource.json
    runtime = Path(settings.data_dir) / 'runs' / f'run_{run_id}' / 'runtime'
    runtime.mkdir(parents=True, exist_ok=True)
    samples = [
        {'timestamp': time.time(), 'cpu_system_percent': 1.2, 'proc_cpu_percent': 0.1},
        {'timestamp': time.time(), 'cpu_system_percent': 3.4, 'proc_cpu_percent': 0.2},
    ]
    (runtime / 'resource.json').write_text(json.dumps(samples))

    res = client.get(f'/runs/{run_id}/metrics')
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert data[0].get('cpu_system_percent') == 1.2


def test_hosts_metrics_snapshot(tmp_path: Path):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    res = client.get('/metrics/hosts')
    assert res.status_code == 200
    data = res.json()
    assert 'cpu_percent' in data
    assert 'memory_total' in data
    assert 'gpus' in data
