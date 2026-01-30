from unittest.mock import MagicMock
from sunstone_backend.jobs import SSHJobRunner
import subprocess
import pytest


def test_ssh_cancel_uses_kill_term(monkeypatch):
    runner = SSHJobRunner()
    calls = []

    def fake_run(cmd, check, stdout, stderr, timeout=None, **kwargs):
        calls.append(cmd)
        m = MagicMock()
        m.returncode = 0
        return m

    monkeypatch.setattr(subprocess, 'run', fake_run)

    job = {"pid": 12345, "ssh_target": "alice@remote:/tmp/sr", "mode": "ssh"}
    runner.cancel(job)

    assert any(call[0] == 'ssh' and any('kill -TERM' in str(c) for c in call) for call in calls)


def test_ssh_cancel_raises_without_target():
    runner = SSHJobRunner()
    with pytest.raises(RuntimeError):
        runner.cancel({"pid": 1, "mode": "ssh"})
