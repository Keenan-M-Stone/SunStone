from __future__ import annotations

import os
import signal
import subprocess
import sys
from pathlib import Path

from .models.run import JobFile, RunRecord
from .util.time import utc_now_iso


class LocalJobRunner:
    def __init__(self) -> None:
        pass

    def submit(
        self,
        run: RunRecord,
        run_dir: Path,
        backend: str,
        python_executable: str | None = None,
    ) -> JobFile:
        logs_dir = run_dir / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = logs_dir / "stdout.log"
        stderr_path = logs_dir / "stderr.log"

        py = (python_executable.strip() if python_executable else sys.executable)
        py_path = Path(py)
        # If a directory is passed, try to resolve to the python executable
        if py_path.is_dir():
            # Try common locations for conda/venv
            candidates = [py_path / "bin" / "python", py_path / "Scripts" / "python.exe"]
            py_exec = None
            for candidate in candidates:
                if candidate.exists() and candidate.is_file():
                    py_exec = str(candidate)
                    break
            if not py_exec:
                raise RuntimeError(f"Could not find python executable in {py_path}")
            py = py_exec

        cmd = [
            py,
            "-m",
            "sunstone_backend.worker",
            "--run-dir",
            str(run_dir),
            "--backend",
            backend,
        ]

        with open(stdout_path, "ab", buffering=0) as stdout_f, open(
            stderr_path, "ab", buffering=0
        ) as stderr_f:
            proc = subprocess.Popen(
                cmd,
                stdout=stdout_f,
                stderr=stderr_f,
                cwd=str(run_dir),
                start_new_session=True,
            )

        return JobFile(pid=proc.pid, started_at=utc_now_iso(), backend=backend, mode="local")

    def cancel(self, job: JobFile) -> None:
        # Kill the whole process group
        try:
            os.killpg(job.pid, signal.SIGTERM)
        except ProcessLookupError:
            return


class SSHJobRunner:
    """SSH runner with basic auth options, retries, and remote-status checks.

    Supports optional ssh port and identity file via ssh_options dict passed into submit_ssh. Commands
    are executed with retries on transient failures.
    """

    def __init__(self) -> None:
        pass

    def _ssh_base_args(self, host: str, port: int | None = None, identity_file: str | None = None, extra: list[str] | None = None) -> list[str]:
        args: list[str] = ["ssh"]
        if identity_file:
            args.extend(["-i", str(identity_file)])
        if port:
            args.extend(["-p", str(port)])
        if extra:
            args.extend(extra)
        args.append(host)
        return args

    def _scp_args(self, host: str, port: int | None = None, identity_file: str | None = None, extra: list[str] | None = None) -> list[str]:
        args: list[str] = ["scp", "-r"]
        if identity_file:
            args.extend(["-i", str(identity_file)])
        if port:
            args.extend(["-P", str(port)])
        if extra:
            args.extend(extra)
        args.append("")  # placeholder for source
        args.append("")  # placeholder for dest
        return args

    def _run_with_retries(self, cmd: list[str], attempts: int = 3, timeout: int = 30) -> subprocess.CompletedProcess:
        import time
        import subprocess

        last_exc = None
        for i in range(attempts):
            try:
                return subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
            except subprocess.CalledProcessError as e:
                last_exc = e
                if i < attempts - 1:
                    time.sleep(0.5 * (2 ** i))
                    continue
                raise
            except Exception as e:
                last_exc = e
                if i < attempts - 1:
                    time.sleep(0.5 * (2 ** i))
                    continue
                raise

        # If we exit loop without returning, re-raise last
        if last_exc:
            raise last_exc
        raise RuntimeError("Unhandled error in _run_with_retries")

    def check_remote_pid(self, ssh_target: str, pid: int, port: int | None = None, identity_file: str | None = None) -> bool:
        """Return True if PID is running on remote host, False otherwise."""
        import shlex
        import subprocess

        if not ssh_target or '@' not in ssh_target:
            return False
        userhost = ssh_target.split(':', 1)[0]
        # Use kill -0 for a lightweight check
        cmd = self._ssh_base_args(userhost, port=port, identity_file=identity_file)[:-1] + [f"kill -0 {pid} || true"]
        try:
            res = self._run_with_retries(cmd, attempts=2, timeout=10)
            # If exit code 0, kill -0 succeeded; if non-zero, process missing
            return res.returncode == 0
        except Exception:
            return False

    def submit_ssh(self, run: RunRecord, run_dir: Path, backend: str, ssh_target: str, python_executable: str | None = None, ssh_options: dict | None = None) -> JobFile:
        import shlex
        import subprocess

        port = ssh_options.get('port') if ssh_options else None
        identity_file = ssh_options.get('identity_file') if ssh_options else None
        extra_raw = ssh_options.get('extra') if ssh_options else None
        extra = extra_raw.split() if isinstance(extra_raw, str) and extra_raw.strip() else []
        agent_forwarding = bool(ssh_options.get('agent_forwarding')) if ssh_options else False
        strict_host_key = ssh_options.get('strict_host_key_checking') if ssh_options and 'strict_host_key_checking' in ssh_options else None
        known_hosts_file = ssh_options.get('known_hosts_file') if ssh_options else None

        # Build final extra args list
        extra_args: list[str] = list(extra)
        if agent_forwarding:
            # Agent forwarding should be a top-level flag
            extra_args.insert(0, '-A')
        if strict_host_key is False:
            extra_args.extend(['-o', 'StrictHostKeyChecking=no'])
        if known_hosts_file:
            extra_args.extend(['-o', f'UserKnownHostsFile={known_hosts_file}'])

        if not ssh_target or '@' not in ssh_target:
            raise RuntimeError('ssh_target must be in user@host[:path] form')

        userhost, *path_part = ssh_target.split(':', 1)
        remote_path = path_part[0] if path_part else f"~/sunstone_runs/run_{run.id}"
        py = python_executable or 'python'

        # Step 1: ensure remote path exists
        try:
            mkdir_cmd = self._ssh_base_args(userhost, port=port, identity_file=identity_file, extra=extra_args)[:-1] + [f"mkdir -p {shlex.quote(remote_path)}"]
            self._run_with_retries(mkdir_cmd, attempts=3, timeout=10)
        except Exception as e:
            raise RuntimeError(f"Failed to create remote directory {remote_path}: {e}") from e

        # Step 2: copy run dir to remote (copy directory contents)
        try:
            scp_cmd = self._scp_args(userhost, port=port, identity_file=identity_file, extra=extra_args)
            scp_cmd[-2] = str(run_dir) + "/"
            scp_cmd[-1] = f"{userhost}:{remote_path}/"
            self._run_with_retries(scp_cmd, attempts=3, timeout=300)
        except Exception as e:
            raise RuntimeError(f"Failed to copy run directory to remote: {e}") from e

        # Step 3: construct remote command and start with nohup
        remote_cmd = f"{shlex.quote(py)} -m sunstone_backend.worker --run-dir {shlex.quote(remote_path)} --backend {shlex.quote(backend)}"
        remote_launch = (
            f"nohup {remote_cmd} > {shlex.quote(remote_path + '/remote_stdout.log')} "
            f"2> {shlex.quote(remote_path + '/remote_stderr.log')} < /dev/null & echo $!"
        )

        try:
            ssh_cmd = self._ssh_base_args(userhost, port=port, identity_file=identity_file, extra=extra_args)[:-1] + [remote_launch]
            res = self._run_with_retries(ssh_cmd, attempts=3, timeout=30)
            out = res.stdout.strip()
            try:
                pid = int(out.splitlines()[-1].strip()) if out else 0
            except Exception:
                pid = 0
        except Exception as e:
            raise RuntimeError(f"Failed to launch remote worker: {e}") from e

        job = JobFile(pid=pid, started_at=utc_now_iso(), backend=backend, mode='ssh')
        # Attach remote metadata in a private attribute so callers can persist it if desired
        try:
            job._remote_path = remote_path
            job._ssh_target = ssh_target
            job._ssh_port = port
            job._identity_file = identity_file
            job._ssh_options = ssh_options
        except Exception:
            pass
        return job

    def cancel(self, job: JobFile | dict) -> None:
        """Cancel a remote SSH-launched job.

        The function expects either a dict loaded from job.json (containing 'ssh_target' and 'pid')
        or a JobFile (which will not contain ssh metadata). In the latter case, cancellation cannot
        be performed and a RuntimeError is raised.
        """
        import subprocess

        # Normalize job to dict
        if isinstance(job, JobFile):
            raise RuntimeError("SSH cancel requires job metadata (ssh_target) in job.json")

        pid = int(job.get("pid", 0))
        ssh_target = job.get("ssh_target")
        if not ssh_target:
            raise RuntimeError("SSH cancel requires 'ssh_target' field in job metadata")
        if pid <= 0:
            # Nothing to do
            return

        userhost = ssh_target.split(":", 1)[0]
        port = None
        # Parse port if provided in target like user@host:port/path (we don't use path parsing here)
        if ':' in ssh_target.split('@', 1)[1]:
            # If user@host:port/path or user@host:port
            after = ssh_target.split('@', 1)[1]
            if '/' in after:
                hostport = after.split('/', 1)[0]
            else:
                hostport = after
            if ':' in hostport:
                try:
                    port = int(hostport.split(':', 1)[1])
                except Exception:
                    port = None

        # Attempt graceful TERM then KILL
        try:
            ssh_cmd = self._ssh_base_args(userhost, port=port)[:-1] + [f"kill -TERM {pid}"]
            self._run_with_retries(ssh_cmd, attempts=2, timeout=10)
        except Exception:
            # If TERM fails, try hard kill
            ssh_cmd = self._ssh_base_args(userhost, port=port)[:-1] + [f"kill -9 {pid}"]
            try:
                self._run_with_retries(ssh_cmd, attempts=1, timeout=10)
            except Exception:
                # If that fails, bubble up
                raise
