from __future__ import annotations

import os
from pathlib import Path

import typer
import uvicorn

from .settings import Settings


def api(
    data_dir: Path = typer.Option(None, help="Where projects/runs are stored"),
    host: str = typer.Option(None, help="Bind host"),
    port: int = typer.Option(None, help="Bind port"),
    reload: bool = typer.Option(False, help="Auto-reload (dev)"),
) -> None:
    s = Settings()
    if data_dir is not None:
        os.environ["SUNSTONE_DATA_DIR"] = str(data_dir)
        s.data_dir = data_dir
    if host is not None:
        s.host = host
    if port is not None:
        s.port = port

    uvicorn.run(
        "sunstone_backend.api.app:create_app",
        factory=True,
        host=s.host,
        port=s.port,
        reload=reload,
    )


def worker(run_dir: Path = typer.Option(...), backend: str = typer.Option("dummy")) -> None:
    from .worker import main as worker_main

    worker_main(run_dir=run_dir, backend=backend)


def api_entry() -> None:
    typer.run(api)


def worker_entry() -> None:
    typer.run(worker)


if __name__ == "__main__":
    api_entry()
