from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
import json
from pathlib import Path
from sunstone_backend.jobs import LocalJobRunner


def test_api_submit_and_worker_with_approximation(tmp_path: Path, monkeypatch):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create project and run via API
    res = client.post('/projects', json={'name': 'e2e-approx'})
    project = res.json()
    spec = {
        'domain': {'cell_size': [2e-05, 1.2e-05, 0], 'resolution': 40, 'dimension': '2d'},
        'materials': [
            {'name': 'met', 'eps': {'real': 2.0, 'imag': -0.1}, 'approximate_complex': True},
        ],
        'geometry': [{'type': 'block', 'size': [5e-07, 3.25e-06, 0], 'center': [0, 0, 0], 'material': 'met'}],
        'run_control': {'until': 'time', 'max_time': 1e-15},
    }
    res = client.post(f"/projects/{project['id']}/runs", json={'spec': spec})
    run = res.json()

    # Monkeypatch LocalJobRunner.submit to avoid spawning a subprocess in test
    def fake_submit(self, run, run_dir, backend, python_executable=None):
        # Return a lightweight object that mimics JobFile with model_dump_json
        class FakeJob:
            def __init__(self, pid=0, backend=backend, mode='local'):
                self.pid = pid
                self.started_at = 'now'
                self.backend = backend
                self.mode = mode

            def model_dump_json(self, indent=None):
                import json

                return json.dumps({
                    'pid': self.pid,
                    'started_at': self.started_at,
                    'backend': self.backend,
                    'mode': self.mode,
                }, indent=indent)

        return FakeJob()

    monkeypatch.setattr(LocalJobRunner, 'submit', fake_submit)

    # Call submit endpoint (should persist normalized materials in spec.json)
    res = client.post(f"/runs/{run['id']}/submit", json={'mode': 'local', 'backend': 'meep'})
    assert res.status_code == 200

    run_dir = Path(settings.data_dir) / 'runs' / f"run_{run['id']}"

    # Confirm normalized materials mapping persisted
    spec_on_disk = json.loads((run_dir / 'spec.json').read_text())
    assert isinstance(spec_on_disk.get('materials'), dict)
    assert 'met' in spec_on_disk['materials']

    # Now run the worker directly (synchronous) using meep backend
    from sunstone_backend.worker import main as worker_main
    worker_main(run_dir=run_dir, backend='meep')

    out = run_dir / 'outputs' / 'summary.json'
    assert out.exists()
