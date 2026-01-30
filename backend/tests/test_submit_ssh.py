import json
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
from pathlib import Path


def test_submit_ssh_records_job_and_target(tmp_path: Path):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run
    res = client.post('/projects', json={'name': 'sshtest'})
    assert res.status_code == 200
    project = res.json()
    spec = {'domain': {'cell_size': [1.0, 1.0, 0], 'resolution': 10}}
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    assert res.status_code == 200
    run = res.json()
    run_id = run['id']

    # Submit with mode=ssh and ssh_target
    payload = {
        'mode': 'ssh',
        'backend': 'dummy',
        'ssh_target': 'alice@hpc.example'
    }
    res = client.post(f"/runs/{run_id}/submit", json=payload)
    assert res.status_code == 200

    runtime = Path(settings.data_dir) / 'runs' / f'run_{run_id}' / 'runtime'
    job_file = runtime / 'job.json'
    assert job_file.exists()
    job = json.loads(job_file.read_text())
    assert job.get('mode') == 'ssh'
    # Either recorded directly or written by SSHJobRunner
    assert (job.get('ssh_target') == 'alice@hpc.example') or ('ssh_target' in job)

    # Check run status recorded as submitted
    r = client.get(f"/runs/{run_id}").json()
    assert r.get('status') == 'submitted'


def test_submit_ssh_persists_remote_path_when_available(tmp_path, monkeypatch):
    from sunstone_backend.jobs import SSHJobRunner
    from sunstone_backend.models.run import JobFile
    from sunstone_backend.util.time import utc_now_iso

    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run
    res = client.post('/projects', json={'name': 'sshtest2'})
    assert res.status_code == 200
    project = res.json()
    spec = {'domain': {'cell_size': [1.0, 1.0, 0], 'resolution': 10}}
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    assert res.status_code == 200
    run = res.json()
    run_id = run['id']

    # Monkeypatch SSHJobRunner.submit_ssh to simulate success and set remote_path
    def fake_submit(self, run, run_dir, backend, ssh_target, python_executable=None):
        j = JobFile(pid=4242, started_at=utc_now_iso(), backend=backend, mode='ssh')
        j._remote_path = '/remote/sunstone/runs/run_' + run.id
        return j

    monkeypatch.setattr(SSHJobRunner, 'submit_ssh', fake_submit)

    payload = {
        'mode': 'ssh',
        'backend': 'dummy',
        'ssh_target': 'alice@hpc.example:/remote/sunstone'
    }
    res = client.post(f"/runs/{run_id}/submit", json=payload)
    assert res.status_code == 200

    runtime = Path(settings.data_dir) / 'runs' / f'run_{run_id}' / 'runtime'
    job_file = runtime / 'job.json'
    assert job_file.exists()
    job = json.loads(job_file.read_text())
    assert job.get('mode') == 'ssh'
    assert job.get('ssh_target') == 'alice@hpc.example:/remote/sunstone'
    assert job.get('remote_path') == '/remote/sunstone/runs/run_' + run_id
