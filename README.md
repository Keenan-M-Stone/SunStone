# SunStone

SunStone is a FOSS optics simulation platform (Meep-first) with:
- A Vite/React frontend ([frontend](frontend))
- A Python FastAPI control plane + worker runner ([backend](backend))

The canonical design spec and build plan is in [foss-optics-fdtd-spec.md](foss-optics-fdtd-spec.md).

## Prereqs

- Conda environment: `sunstone` (see [environment.yml](environment.yml))
- Node.js + npm (for the UI)

## Dev quick start

If you prefer a one-command startup/shutdown for both services:

```bash
./scripts/dev-up.sh
```

Stop them:

```bash
./scripts/dev-down.sh
```

Check status (PID + log locations):

```bash
./scripts/dev-status.sh
```

### 1) Backend (API + local worker)

```bash
conda activate sunstone
cd SunStone/backend
pip install -e .

# Run in the foreground
uvicorn sunstone_backend.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

API docs:
- http://127.0.0.1:8000/docs

### 2) Frontend

```bash
cd SunStone/frontend
npm install
npm run dev
```

Then open:
- http://localhost:5173

## Running a first simulation

The current v0 implementation includes a `dummy` backend:
- It generates synthetic point-monitor time series and writes them to Zarr under `outputs/monitors/`.
- This proves the run-directory + artifact contract before integrating a real solver.

From the UI:
- Create project → create run from the JSON spec → submit with backend `dummy`.

## Meep integration note

Meep’s Python bindings may not be available for the newest Python.
The control plane can remain on Python 3.13 while the worker runs under a different interpreter.
See [backend/README.md](backend/README.md) for the `python_executable` submit option.
