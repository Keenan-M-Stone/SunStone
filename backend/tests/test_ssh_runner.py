import subprocess
from pathlib import Path
import json
from unittest.mock import patch, MagicMock
from sunstone_backend.jobs import SSHJobRunner
from sunstone_backend.models.run import RunRecord
from sunstone_backend.util.time import utc_now_iso


def test_ssh_runner_submit_copies_and_launches(tmp_path: Path, monkeypatch):
    # Create a fake run dir
    run_id = 'test123'
    run_dir = tmp_path / f'run_{run_id}'
    run_dir.mkdir(parents=True)
    # Add a spec file to simulate content
    (run_dir / 'spec.json').write_text(json.dumps({'domain': {'resolution': 10}}))

    runrec = RunRecord(id=run_id, project_id='p', created_at=utc_now_iso(), status='created', backend='dummy')

    runner = SSHJobRunner()

    # Mock subprocess.run for scp and ssh
    calls = []

    def fake_run(cmd, check, stdout, stderr, text=False, timeout=None):
        calls.append(cmd)
        # If it's scp, return success
        if cmd[0] == 'scp':
            return MagicMock(stdout=b'', stderr=b'', returncode=0)
        # If it's ssh, simulate printing a pid for launch, or success for mkdir
        if cmd[0] == 'ssh':
            m = MagicMock()
            # If the ssh command contains mkdir, return empty stdout
            if any('mkdir -p' in str(c) for c in cmd):
                m.stdout = ''
            else:
                m.stdout = '12345\n'
            m.returncode = 0
            return m
        raise RuntimeError('unexpected command')

    monkeypatch.setattr(subprocess, 'run', fake_run)

    job = runner.submit_ssh(run=runrec, run_dir=run_dir, backend='dummy', ssh_target='alice@remote:/tmp/sr')
    assert job.backend == 'dummy'
    assert isinstance(job.pid, int)
    # pid should be parsed from fake output
    assert job.pid == 12345
    # Verify mkdir, scp and launch were called
    assert any(call[0] == 'ssh' and any('mkdir -p' in str(c) for c in call) for call in calls)
    assert any(call[0] == 'scp' for call in calls)
    assert any(call[0] == 'ssh' and any('nohup' in str(c) for c in call) for call in calls)
