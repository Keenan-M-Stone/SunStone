import json
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
from pathlib import Path


def test_job_status_api_reports_remote_running(tmp_path: Path, monkeypatch):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run
    res = client.post('/projects', json={'name': 'statustest'})
    project = res.json()
    spec = {'domain': {'cell_size': [1.0, 1.0, 0], 'resolution': 10}}
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    run = res.json()
    run_id = run['id']

    runtime = Path(settings.data_dir) / 'runs' / f'run_{run_id}' / 'runtime'
    runtime.mkdir(parents=True, exist_ok=True)

    # Write job.json for an ssh job
    job = {'pid': 4242, 'ssh_target': 'alice@remote:/tmp/sr', 'mode': 'ssh'}
    (runtime / 'job.json').write_text(json.dumps(job))

    # Monkeypatch SSHJobRunner.check_remote_pid
    def fake_check(ssh_target, pid, port=None, identity_file=None):
        assert ssh_target == 'alice@remote:/tmp/sr'
        assert pid == 4242
        return True

    from sunstone_backend.jobs import SSHJobRunner
    monkeypatch.setattr(SSHJobRunner, 'check_remote_pid', staticmethod(fake_check))

    res = client.get(f"/runs/{run_id}/job/status")
    assert res.status_code == 200
    data = res.json()
    assert data.get('running') is True
    assert data.get('pid') == 4242
    assert data.get('ssh_target') == 'alice@remote:/tmp/sr'
