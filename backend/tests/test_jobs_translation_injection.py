import json
import sys
from pathlib import Path
from sunstone_backend.jobs import LocalJobRunner
from sunstone_backend.models.run import RunRecord


class FakePopen:
    def __init__(self, *args, **kwargs):
        self.pid = 4242
        self.returncode = 0
        self.stdout = b''
        self.stderr = b''
        self.args = args[0] if args else []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def communicate(self, input=None, timeout=None):
        return (self.stdout, self.stderr)

    def kill(self):
        self.returncode = -9

    def wait(self, timeout=None):
        return self.returncode

    def poll(self):
        return self.returncode


def test_local_submit_injects_native_fragments(tmp_path: Path, monkeypatch):
    # Prepare a fake run dir with spec.json
    run_id = "test-1"
    run_dir = tmp_path / f"run_{run_id}"
    run_dir.mkdir(parents=True)
    spec = {"domain": {"cell_size": [1.0, 1.0, 0], "resolution": 10}, "boundary_conditions": []}
    spec_path = run_dir / "spec.json"
    spec_path.write_text(json.dumps(spec))

    # Minimal RunRecord (fields required by RunRecord model)
    run = RunRecord(id=run_id, project_id="p1", created_at="now", status="created", backend="opal")

    # Patch subprocess.Popen so we don't actually spawn processes
    monkeypatch.setattr('sunstone_backend.jobs.subprocess.Popen', FakePopen)

    # Patch the translate helper to return a predictable fragment
    def fake_translate(name, s):
        return {"backend": name, "translated": {f"{name}_input": {"surface_conditions": [{"direction": "X", "side": "High", "condition": "conducting", "params": {}}]}}, "warnings": []}

    monkeypatch.setattr('sunstone_backend.api.routes.backends.translate_backend', fake_translate)

    runner = LocalJobRunner()
    job = runner.submit(run, run_dir, backend="opal", python_executable=sys.executable)

    # Verify process PID comes from our fake popen
    assert job.pid == 4242

    # Verify spec.json was updated with opal_input
    updated = json.loads(spec_path.read_text())
    assert 'opal_input' in updated
    # Conservatively ensure the injected structure looks like what we returned
    assert 'surface_conditions' in updated['opal_input']
