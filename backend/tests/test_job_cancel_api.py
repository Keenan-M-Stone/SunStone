import json
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
from pathlib import Path
from unittest.mock import MagicMock
import subprocess


def test_job_cancel_api_ssh_invokes_kill(tmp_path: Path, monkeypatch):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run
    res = client.post('/projects', json={'name': 'ktest'})
    project = res.json()
    spec = {'domain': {'cell_size': [1.0, 1.0, 0], 'resolution': 10}}
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    run = res.json()
    run_id = run['id']

    runtime = Path(settings.data_dir) / 'runs' / f'run_{run_id}' / 'runtime'
    runtime.mkdir(parents=True, exist_ok=True)

    job = {'pid': 4242, 'ssh_target': 'alice@remote:/tmp/sr', 'mode': 'ssh'}
    (runtime / 'job.json').write_text(json.dumps(job))

    calls = []

    def fake_run(cmd, check, stdout, stderr, timeout=None, **kwargs):
        calls.append(cmd)
        m = MagicMock()
        m.returncode = 0
        return m

    monkeypatch.setattr(subprocess, 'run', fake_run)

    res = client.post(f"/runs/{run_id}/job/cancel")
    assert res.status_code == 200
    assert res.json() == {'ok': True}
    assert any(call[0] == 'ssh' and 'kill -TERM' in call[-1] for call in calls)
