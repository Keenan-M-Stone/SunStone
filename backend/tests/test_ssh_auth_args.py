import subprocess
from pathlib import Path
from unittest.mock import MagicMock
from sunstone_backend.jobs import SSHJobRunner
from sunstone_backend.models.run import RunRecord
from sunstone_backend.util.time import utc_now_iso


def test_submit_includes_agent_and_known_hosts(tmp_path: Path, monkeypatch):
    run_id = 'auth123'
    run_dir = tmp_path / f'run_{run_id}'
    run_dir.mkdir(parents=True)
    (run_dir / 'spec.json').write_text('{}')
    run = RunRecord(id=run_id, project_id='p', created_at=utc_now_iso(), status='created', backend='dummy')

    runner = SSHJobRunner()
    calls = []

    def fake_run(cmd, check, stdout, stderr, timeout=None, **kwargs):
        calls.append(cmd)
        # Simulate success and return pid for launch
        m = MagicMock()
        if any('nohup' in str(c) for c in cmd):
            m.stdout = '7777\n'
        else:
            m.stdout = ''
        m.returncode = 0
        return m

    monkeypatch.setattr(subprocess, 'run', fake_run)

    ssh_options = {
        'port': 2222,
        'identity_file': '/home/alice/.ssh/id_rsa',
        'agent_forwarding': True,
        'strict_host_key_checking': False,
        'known_hosts_file': '/tmp/known_hosts',
        'extra': '-o LogLevel=ERROR'
    }

    job = runner.submit_ssh(run=run, run_dir=run_dir, backend='dummy', ssh_target='alice@remote:/tmp/sr', ssh_options=ssh_options)
    assert job.pid == 7777

    # Ensure scp includes -P 2222 or -i and UserKnownHostsFile and StrictHostKeyChecking option
    found_scp = any(call[0] == 'scp' and any('-P' in str(c) or '-i' in str(c) for c in call) for call in calls)
    assert found_scp

    # Ensure ssh launch contains '-A' (agent forwarding), UserKnownHostsFile and StrictHostKeyChecking=no
    found_launch = any(call[0] == 'ssh' and any('-A' in str(c) for c in call) and any('UserKnownHostsFile' in str(c) for c in call) and any('StrictHostKeyChecking=no' in str(c) for c in call) for call in calls)
    assert found_launch
