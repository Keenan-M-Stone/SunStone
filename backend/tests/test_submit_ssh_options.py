import json
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
from pathlib import Path


def test_submit_ssh_persists_ssh_options(tmp_path: Path):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run
    res = client.post('/projects', json={'name': 'sshtest3'})
    project = res.json()
    spec = {'domain': {'cell_size': [1.0, 1.0, 0], 'resolution': 10}}
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    run = res.json()
    run_id = run['id']

    payload = {
        'mode': 'ssh',
        'backend': 'dummy',
        'ssh_target': 'alice@hpc.example:/remote',
        'ssh_options': {'port': 2222, 'identity_file': '/home/alice/.ssh/id_rsa'}
    }
    res = client.post(f"/runs/{run_id}/submit", json=payload)
    assert res.status_code == 200

    runtime = Path(settings.data_dir) / 'runs' / f'run_{run_id}' / 'runtime'
    job_file = runtime / 'job.json'
    assert job_file.exists()
    job = json.loads(job_file.read_text())
    assert job.get('ssh_options') == {'port': 2222, 'identity_file': '/home/alice/.ssh/id_rsa'}
    assert job.get('ssh_target') == 'alice@hpc.example:/remote'
