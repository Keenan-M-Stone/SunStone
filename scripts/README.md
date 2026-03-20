# Convenience Scripts

## Scripts in this directory

- dev-up.sh: Start backend and frontend dev servers. Writes PIDs to `.sunstone/dev/pids/` and logs to `.sunstone/dev/logs/`.
- dev-down.sh: Stop SunStone processes started by `dev-up.sh` (uses pidfiles and targeted port fallback).
- dev-status.sh: Show backend/frontend status from pidfiles and log locations.
- e2e.sh: Start the dev stack, run Playwright E2E tests, then tear everything down.

## Diagnostics

- diagnostics/env_check.sh: checks Python, Node, and key Python packages.
- diagnostics/run_tests.sh: runs `pytest -q` for the repository.
- diagnostics/frontend_check.sh: verifies frontend `npm ci` and attempts a build or lint.
- diagnostics/health_check.sh: runs all diagnostics and writes `health_summary.json`.

## Usage

- Make scripts executable: `chmod +x scripts/*.sh scripts/diagnostics/*.sh`
- Start dev environment: `scripts/dev-up.sh`
- Stop dev environment: `scripts/dev-down.sh`
- Show status: `scripts/dev-status.sh`
- Run quick checks: `scripts/diagnostics/env_check.sh`

## Optional environment variables

- `SUNSTONE_BACKEND_PORT` — backend port (default 8000).
- `SUNSTONE_FRONTEND_PORT` — frontend port (default 5173).
- `SUNSTONE_CONDA_ENV` — conda environment name (default `sunstone`).
- `SUNSTONE_BACKEND_PYTHON` — override Python interpreter for the backend.
- `SUNSTONE_NO_OPEN=1` — do not auto-open browser.
