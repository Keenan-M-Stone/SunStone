import json
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
from pathlib import Path


def test_job_stream_emits_events(tmp_path: Path, monkeypatch):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run
    res = client.post('/projects', json={'name': 'streamtest'})
    project = res.json()
    spec = {'domain': {'cell_size': [1.0, 1.0, 0], 'resolution': 10}}
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    run = res.json()
    run_id = run['id']

    runtime = Path(settings.data_dir) / 'runs' / f'run_{run_id}' / 'runtime'
    runtime.mkdir(parents=True, exist_ok=True)

    job = {'pid': 4242, 'ssh_target': 'alice@remote:/tmp/sr', 'mode': 'ssh'}
    (runtime / 'job.json').write_text(json.dumps(job))
    (runtime / 'resource.json').write_text(json.dumps({'cpu': {'percent': 10}}))

    # Monkeypatch check_remote_pid to return True
    from sunstone_backend.jobs import SSHJobRunner

    def fake_check(ssh_target, pid, port=None, identity_file=None):
        return True

    monkeypatch.setattr(SSHJobRunner, 'check_remote_pid', staticmethod(fake_check))

    # Stream a few events at short interval and request a small bounded number of events
    with client.stream("GET", f"/runs/{run_id}/job/stream", params={'interval': 0.05, 'max_events': 2}) as resp:
        assert resp.status_code == 200
        events = []
        for line in resp.iter_lines():
            if not line:
                continue
            if isinstance(line, bytes):
                line = line.decode('utf-8')
            if line.startswith('data: '):
                payload = json.loads(line[len('data: '):])
                events.append(payload)
            if len(events) >= 2:
                break

    assert len(events) >= 1
    assert 'job' in events[0]
    assert events[0]['running'] is True
    assert 'resource' in events[0]
