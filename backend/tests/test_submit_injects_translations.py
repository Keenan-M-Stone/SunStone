import json
from pathlib import Path
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
import subprocess


class FakePopen:
    def __init__(self, *args, **kwargs):
        self.pid = 12345
        self.returncode = 0
        self.stdout = b''
        self.stderr = b''
        # args typically contains the command list as the first element
        self.args = args[0] if args else []
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc, tb):
        return False
    def communicate(self, input=None, timeout=None):
        # return bytes or str depending on invocation; we return bytes
        return (self.stdout, self.stderr)
    def kill(self):
        self.returncode = -9
    def wait(self, timeout=None):
        return self.returncode
    def poll(self):
        return self.returncode


def test_submit_injects_translator_fragments(tmp_path: Path, monkeypatch):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run
    res = client.post('/projects', json={'name': 'translator-inject'})
    project = res.json()
    spec = {
        'domain': {'cell_size': [1.0, 1.0, 0], 'resolution': 30},
        'boundary_conditions': [
            {'face': 'px', 'type': 'pec'},
        ]
    }
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    run = res.json()
    run_id = run['id']

    run_dir = Path(settings.data_dir) / 'runs' / f'run_{run_id}'

    # Patch subprocess.Popen in jobs to prevent actually launching a worker process
    monkeypatch.setattr('sunstone_backend.jobs.subprocess.Popen', FakePopen)

    # Also patch the server translate helper to return a predictable native fragment
    def fake_translate(name, s):
        return {"backend": name, "translated": {f"{name}_input": {"surface_conditions": [{"direction": "X", "side": "High", "condition": "conducting", "params": {}}]}}, "warnings": []}
    monkeypatch.setattr('sunstone_backend.api.routes.backends.translate_backend', fake_translate)

    # Submit run locally for backend 'opal' — LocalJobRunner.submit should call our fake_translate and inject opal_input
    res = client.post(f"/runs/{run_id}/submit", json={'mode': 'local', 'backend': 'opal'})
    assert res.status_code == 200

    # Check that spec.json now contains opal_input (injected by LocalJobRunner.submit)
    spec_path = run_dir / 'spec.json'
    assert spec_path.exists()
    updated = json.loads(spec_path.read_text())
    assert 'opal_input' in updated or 'surface_conditions' in updated

    # Check job metadata exists
    job_path = run_dir / 'runtime' / 'job.json'
    assert job_path.exists()
    job = json.loads(job_path.read_text())
    # Ensure our fake proc pid is recorded
    assert job.get('pid', 0) == 12345
