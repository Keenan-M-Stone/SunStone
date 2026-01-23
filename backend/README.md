# SunStone Backend (control plane)

This package provides:
- A FastAPI control-plane server (`sunstone-api`).
- A local worker entrypoint (`sunstone-worker`) used by the control plane to execute runs out-of-process.

## Quick start (dev)

From the `sunstone` conda env:

```bash
cd SunStone/backend
pip install -e .

# Run the API server
sunstone-api --data-dir ../.sunstone --reload

# In another terminal, the frontend can talk to it:
cd ../frontend
npm run dev
```

## Data directory layout

By default, the server writes run directories under the configured data dir:

```
<data-dir>/
  projects/
  runs/
```

Each run is stored as `runs/run_<id>/` with the layout described in the project spec.

## Running a backend in a separate env (Meep)

Meep’s Python bindings may lag the newest Python release. The control plane can stay on
Python 3.13, while the worker runs under a different interpreter.

- Create another conda env (example): `conda create -n sunstone-meep python=3.11 pymeep` (package availability may vary)
- Submit with a `python_executable` override:

```json
{
  "mode": "local",
  "backend": "meep",
  "python_executable": "/home/<you>/miniconda3/envs/sunstone-meep/bin/python"
}
```
