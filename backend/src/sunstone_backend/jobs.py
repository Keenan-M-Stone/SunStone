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
