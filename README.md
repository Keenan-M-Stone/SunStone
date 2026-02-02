# SunStone

SunStone is a free and open source simulation platform for computational electromagnetics.  
The project combines a modern React/Vite frontend and a Python FastAPI control plane with modular solver workers (Meep, dummy, and additional backends).

Key components:
- **Frontend (Vite + React + TypeScript)** — project/run editor, materials, source/monitor placement, 3D preview, and results visualization.
- **Backend (FastAPI)** — spec validation, project/run management, job submission, and worker orchestration.
- **Workers** — run executors that produce standardized artifacts (Zarr, JSON, images).

## Quick start (development)

Pre-reqs:  
- Conda environment: `sunstone` (see [environment.yml](environment.yml))
- Node.js (v18 LTS recommended) + npm

1) Bring up services (dev):

```bash
./scripts/dev-up.sh
```

2) Stop services:

```bash
./scripts/dev-down.sh
```

3) Frontend dev server:

```bash
cd frontend
npm ci
npm run dev
# open http://localhost:5173
```

4) Backend dev server:

```bash
conda activate sunstone
cd backend
pip install -e .
uvicorn sunstone_backend.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

## Testing & diagnostics

We provide a collection of useful scripts under `scripts/`:
- `scripts/sunstone_backend_diag.py` — reachability checks and runs `pytest` for backend tests.
- `scripts/sunstone_frontend_diag.py` — verifies UI reachability, runs frontend unit tests (`vitest`) and builds the frontend.
- `scripts/e2e.sh` — starts both services and runs Playwright E2E tests.
- `scripts/sunstone_fullstack_diag.py` — runs backend/frontend diagnostics and optionally the full Playwright E2E harness when `RUN_E2E=1`.

CI workflows:
- `/.github/workflows/ci.yml` runs backend pytest and frontend unit tests + lint + build.
- `/.github/workflows/e2e.yml` runs an E2E preview and Playwright tests (uses a built preview for determinism).

Run tests locally:
- Backend: `cd backend && pytest -q`
- Frontend unit tests: `cd frontend && npm run test:unit -- --run`
- Playwright e2e: `./scripts/e2e.sh` (recommended for deterministic local runs)

## Unique features

SunStone provides some workflows and features that are rare in similar open-source optics tools:
- **Capability-based backends** — the UI and translators adapt to backend capabilities (e.g., plane detector support) and can expand specs into point-grids when needed.
- **Planar detector previews & point-grid fallback** — the UI renders planar monitor previews and groups point-grid artifacts produced when a backend expands planes to points.
- **Notebook report export** — export a runnable Jupyter notebook that embeds run metadata and includes a recipe to assemble representative GIFs of monitor frames.
- **Deterministic E2E testing harness** — Playwright + a mock backend and global test stubs make end-to-end tests reliable and debuggable.

## Documentation & detailed spec

Please see `docs/foss-optics-fdtd-spec.md` for the full design spec, UI references, and troubleshooting tips.

---