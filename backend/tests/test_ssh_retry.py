import subprocess
from pathlib import Path
from unittest.mock import MagicMock
from sunstone_backend.jobs import SSHJobRunner
from sunstone_backend.models.run import RunRecord
from sunstone_backend.util.time import utc_now_iso


def test_submit_retries_on_transient_scp_error(tmp_path: Path, monkeypatch):
    run_id = 'retry123'
    run_dir = tmp_path / f'run_{run_id}'
    run_dir.mkdir(parents=True)
    (run_dir / 'spec.json').write_text('{}')
    run = RunRecord(id=run_id, project_id='p', created_at=utc_now_iso(), status='created', backend='dummy')

    runner = SSHJobRunner()
    calls = {'scp': 0, 'ssh': 0}

    def fake_run(cmd, check, stdout, stderr, text=False, timeout=None):
        # If scp, fail first time then succeed
        if cmd[0] == 'scp':
            calls['scp'] += 1
            if calls['scp'] == 1:
                raise subprocess.CalledProcessError(returncode=1, cmd=cmd)
            return MagicMock(stdout='', stderr='', returncode=0)
        if cmd[0] == 'ssh':
            calls['ssh'] += 1
            # For mkdir and launch, succeed
            m = MagicMock()
            m.stdout = '9999\n' if 'nohup' in cmd[-1] else ''
            m.returncode = 0
            return m
        raise RuntimeError('unexpected command')

    monkeypatch.setattr(subprocess, 'run', fake_run)

    job = runner.submit_ssh(run=run, run_dir=run_dir, backend='dummy', ssh_target='alice@remote:/tmp/sr')
    assert job.pid == 9999
    assert calls['scp'] == 2
    assert calls['ssh'] >= 1
