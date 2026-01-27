from __future__ import annotations

from pathlib import Path

import typer

from .backends.registry import get_backend
from .models.run import RunStatus, StatusFile

from .util.time import utc_now_iso
from .util.resource_monitor import monitor_resources
import threading

app = typer.Typer(add_completion=False)


def _write_status(run_dir: Path, status: RunStatus, detail: str | None = None) -> None:
    status_path = run_dir / "runtime" / "status.json"
    obj = StatusFile(status=status, updated_at=utc_now_iso(), detail=detail)
    status_path.write_text(obj.model_dump_json(indent=2))


@app.command()

def main(
    run_dir: Path = typer.Option(..., exists=True, file_okay=False),
    backend: str = "dummy",
) -> None:
    resource_thread = threading.Thread(target=monitor_resources, args=(run_dir,), daemon=True)
    try:
        resource_thread.start()
        _write_status(run_dir, "running")
        be = get_backend(backend)
        be.run(run_dir)
        _write_status(run_dir, "succeeded")
    except Exception as e:
        _write_status(run_dir, "failed", detail=str(e))
        raise
    finally:
        # The thread is daemon, so it will exit when the process exits
        pass


if __name__ == "__main__":
    app()
