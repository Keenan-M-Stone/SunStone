# SunStone: Software Spec

Date: 2026-01-22

## 0) Description

Free/open-source simulation platform for building, solving, and visualizing electrodynamic systems in 2D and 3D.  

Features:  

- A modern **Vite/React** UI for geometry import/creation, material assignment, sources/monitors placement, job submission, and results visualization.
  - Fully functioning and configurable CAD GUI and tool set.
  - A variety of free-to-use and open-source backend solvers to promote a wide range of uses and simplify the process of creating and running EM simulations.
    - [Meep](https://github.com/NanoComp/meep) - FDTD (Finite Difference - Time Domain) tools by NanoComp.
    - [Opal](https://gitlab.com/esteban.egea/opal) - Ray tracing toolkit with GPU acceleration.
    - [Civeche](https://github.com/fancompute/ceviche) - FDFD (Finite Difference - Frequency Domain) tools by FanCompute.
    - [pyGDM](https://gitlab.com/wiechapeter/pyGDM2) - GDM (Green dyadic method) simulation tools by Peter Wiecha.
    - [scuffEM](https://github.com/HomerReid/scuff-em) - "Surface-CUrrent-Field Formulation of ElectroMagnetism" by Homer Reid.
- A robust **materials model** (measured/idealized; complex tensors; dispersion models) and repeatable simulation specs.
- Strong **post-processing** (FFT/PSD, near-to-far, movies, exports) built for large datasets.


**Workstation-friendly (development-first)**:  
The platform is designed to run end-to-end on a single workstation for development and testing,  
but solver workers and production deployments can be hosted remotely (SSH, SLURM, HPC, or cloud).  

## 1) Non-goals (for the first releases)

- Building a brand-new 3D GPU FDTD kernel from scratch in v0/v1.
- Full QED “quantized field on a 3D grid” as a scalable general feature (research toy backends may exist later, but not the default path).
- "Electrons as fluids and Hydrodynamic Plasmons" - cool idea, but can't do it until framework is testable so there's something to compare to.
- Real-time interactive steering during simulation (aside from cancel/pause/resume/checkpoint).
- GR tools for implementing Transformation Optics simulation support.

## 2) System-level architecture

### 2.1 Components

1. **Web UI (Vite/React)**
   - Geometry pipeline:
     - Import STEP/STL/OBJ/PLY (and later CAD authoring), transforms, grouping, labeling
   - Materials assignment UI:
     - Browse/search materials DB
     - Set tensor/dispersion
     - Validate passivity/causality where possible
   - Simulation composer:
     - sources, monitors, BCs, resolution, run time, resource profile
   - Job control:
     - Submit, monitor, cancel
     - View logs
     - Download artifacts
   - Results:
     - Plots, 3D preview (decimated), spectra, far fields
     - Export (generate full report as jupyter notebook)
2. **Control Plane API (Python)**
   - Validates simulation specs.
   - Manages projects/runs/artifacts
   - Submits jobs to:
     - local execution (developer mode)
     - SSH remote
     - SLURM/PBS (cluster mode)
   - Tracks status, logs, metadata
3. **Solver Worker(s)**
   - Executed as a separate process/job (never inside the API server).
   - Runner reads a run directory and writes standardized artifacts.
   - Future solvers implement the same run-spec interface/capabilities.
4. **Post-processing Worker(s)**
   - Runs as separate jobs (on the same HPC if needed)
   - Uses chunked array storage + parallel compute

> Workstation default:  
> The same worker model is used locally.  
> The API spawns a solver worker process (and optional postprocess worker), so large runs don’t freeze the UI.  

### 2.3 Hardware auto-detect + optimization (required)

The platform should auto-detect available compute resources and select safe defaults.

Detect (at minimum):

- CPU: logical cores, RAM
- GPU: vendor (NVIDIA/AMD/Intel), VRAM, driver/runtime availability
- Execution environment: Windows+WSL vs native Linux

Use detection to choose defaults:

- Solver:
  - Meep runs on CPU; use local multi-core and/or MPI when available.
- Post-processing:
  - If NVIDIA + CUDA available: prefer CuPy/JAX for array ops
  - Else: CPU NumPy/SciPy + Dask

User overrides:

- UI provides a “Compute profile” page where users can override auto-selected backends and set limits (max RAM, max GPU VRAM fraction, worker count).

Reproducibility:

- Each run writes `runtime/environment.json` containing detected hardware + selected compute backends so results are explainable and repeatable.
- Is this too much? Probably, but need to start somewhere.

### 2.2 “Capability-based” backend design (to allow solver swapping and promote integration with new tools)

Instead of assuming “everything is FDTD”, the platform defines *capabilities*:

- `time_domain_fields`: E/H sampling in time.
- `frequency_domain_outputs`: spectra, S-params (derived or native).
- `near_to_far`: far field transforms.
- `anisotropic_media`: tensor ε/μ.
- `bianisotropic_media`: ξ/ζ (future).
- `dispersive_media`: Drude/Lorentz/ADE.
- `periodic_bloch`: periodic boundaries + Bloch k.
- `symmetry`: reflection/rotation symmetry reductions.
- `checkpoint_restart`: save/resume.

The same abstraction should also support non-FDTD and multiphysics solvers by defining additional capabilities, e.g.:

- `frequency_domain_solver`: direct frequency-domain Maxwell solver (FEM/BEM/FDFD)
- `fluid_electrons`: electron-fluid / hydrodynamic plasmonics backend
- `multiphysics_coupling`: EM coupled to thermal/structural/fluid PDEs

A backend advertises which capabilities it supports; the UI/API enforces constraints.

---  
**Research note**: “Plasmonics as a fluid”

- A common approach models conduction electrons as a hydrodynamic fluid coupled to Maxwell’s equations
  (often called hydrodynamic Drude / nonlocal plasmonics).
- This is conceivable within this platform, but it is not a drop-in setting; it would likely be implemented as:  
  1. A dedicated constitutive/material plugin with extra state variables and spatial-derivative terms
  2. A separate multi-physics backend.

---  

## 3) Data model & file formats

### 3.1 Run directory layout (immutable inputs + append-only outputs)

Each run is a folder with a stable ID.

```dummy
run_<id>/
  spec.json
  geometry/
    sources/ (original user inputs)
    normalized/ (converted canonical assets)
  materials/
    materials_db_snapshot.json
  runtime/
    backend.json
    environment.json
    launch.sh
  logs/
    stdout.log
    stderr.log
  outputs/
    summary.json
    monitors/
    fields/ (optional heavy)
    spectra/
    farfield/
    movies/
  postprocess/
    pipeline.json
    results/
```

### 3.2 Artifact formats

- Scalars/metadata:
  - JSON
- Arrays/time series:
  - **Zarr** (preferred for chunked parallel IO)
  - HDF5 acceptable as an alternative
- Geometry preview:
  - glTF/GLB for UI rendering
  - VTK/VTU for scientific export
- Movies:
  - mp4 (via ffmpeg) + optional frame sequences

### 3.3 The simulation spec (`spec.json`) — minimal schema v0

Top-level:

- `version`: string
- `units`: assume SI; store as explicit (m, s, Hz)
- `geometry`: objects, transforms, material assignments
- `materials`: referenced by ID (snapshot-able)
- `domain`: size, origin, resolution, symmetry
- `boundary_conditions`: PML/periodic/Bloch
- `sources`: time profiles, polarization, location
- `monitors`: sensors/planes/volumes, sampling
- `run_control`: stop conditions, timestep controls
- `resources`: local/HPC profile
- `postprocess`: optional pipeline

Example sketch:

```json
{
  "version": "0.1",
  "units": {"length": "m", "time": "s", "frequency": "Hz"},
  "domain": {
    "cell_size": [8e-6, 8e-6, 8e-6],
    "resolution": 80,
    "symmetry": []
  },
  "boundary_conditions": {
    "type": "pml",
    "pml_thickness": [1e-6, 1e-6, 1e-6]
  },
  "materials": {
    "Au_drude": {"model": "drude", "params": {"wp": 1.37e16, "gamma": 1.05e14}, "eps_inf": 9.5},
    "SiO2": {"model": "constant", "eps": 2.13}
  },
  "geometry": [
    {"id": "substrate", "shape": {"type": "box", "size": [8e-6, 8e-6, 2e-6]}, "material": "SiO2"},
    {"id": "antenna", "shape": {"type": "stl", "path": "geometry/normalized/antenna.stl"}, "material": "Au_drude"}
  ],
  "sources": [
    {"type": "gaussian_pulse", "center_freq": 3.75e14, "fwidth": 5e13,
     "component": "Ez", "position": [0,0,-2e-6], "size": [6e-6, 6e-6, 0]}
  ],
  "monitors": [
    {"type": "point", "id": "E_center", "position": [0,0,0], "components": ["Ex","Ey","Ez"], "dt": 1e-16},
    {"type": "flux", "id": "T", "region": {"center": [0,0,3e-6], "size": [6e-6,6e-6,0]},
     "freqs": {"start": 2e14, "stop": 5e14, "n": 200}}
  ],
  "run_control": {"until": "fields_decay", "threshold": 1e-6, "max_time": 2e-12},
  "resources": {"mode": "slurm", "nodes": 4, "tasks_per_node": 32, "time_limit": "12:00:00"}
}
```

## 4) Backend: Meep runner spec

Meep was the first backend simulation software support was added for, hence many of the
tools were designed with Meep in mind.  
Presently, the backend canonical spec is generated for ingestion by Meep and we provide
auto-translation to support other backend solvers.

### 4.1 Responsibilities

- Read `spec.json` + normalized geometry assets.
- Construct Meep simulation:
  - domain, resolution
  - material grid assignment (voxelization/meshing → epsilon function)
  - PML/periodic BCs
  - sources
  - monitors (field sampling, flux, near-to-far surfaces)
- Run with MPI.
- Write standardized outputs.

Interpreter selection:

- The submit request may include a `python_executable` path so the worker runs in a dedicated Meep
  environment (separate from the control plane).  
  The UI exposes this in the Run panel when the backend is set to `meep`.

**IMPORTANT NOTE**:
> In order to run and monitor simulations using a dedicated virtual environment,  
> the user needs to install `SunStone` backend modules.  
> See `SunStone/backend/README.md` for additional instructions and details.

### 4.2 Geometry ingestion strategy (v0 → v1)

FDTD wants a material assignment on a grid.

- v0: support primitives (box/sphere/cylinder), plus STL via voxelization.
- v1: STEP/IGES via CAD kernel conversion to triangle meshes, then voxelize.
- v2: CAD authoring/boolean ops in UI, then canonical mesh export.

Voxelization choices:

- CPU voxelization: `trimesh` + custom grid intersection
- If needed later: GPU voxelization or external tooling

### 4.3 Materials

- Constant isotropic ε
- Lossy ε (complex constant) treated carefully (stability/passivity checks)
- Dispersive models:
  - Drude/Lorentz via Meep dispersion features

### 4.4 Using approximate complex permittivity

In some cases a user may have a complex-valued permittivity given at a
single frequency (for example from measurements) but not a full dispersive
model.  

SunStone supports an explicit *approximation* workflow to create a
simple Drude dispersive model from such a value so time-domain solvers backends
like Meep can simulate the material.

#### Preserving causality

Time‑domain solvers cannot use a non‑causal complex constant ε directly;
they need a dispersive model.

The Drude model is the simplest causal frequency-dependent model for a metal’s
permittivity that describes free-electron (conduction) response;  
an approximation that lets us convert single‑frequency complex $ε$ to a time‑domain
compatible model.

In frequency domain it’s usually written as $ε(ω) = ε_∞ − ω_p² / (ω² + i γ ω)$  
, where $ε_∞$ is the high‑frequency background, $ω_p$ is the plasma frequency, and $γ$ is the damping (collision) rate.  

In time-domain FDTD it is implemented via an equivalent susceptibility term (e.g., a Drude susceptibility)  
so the solver can evolve fields causally.

#### Limitations and Caveats

The Drude model mainly captures free‑electron (low-frequency/plasmonic) response.  
It often fails to represent inter-band transitions or complex spectral structure in  
the visible/UV—use Lorentz terms or a multi‑oscillator fit when accuracy matters.

> Heuristic convenience: use "a dispersion fit" with multiple spectral points for better fidelity when available.

#### Spec fields (material record)

- `eps`: either a scalar number, a dict `{ "real": <float>, "imag": <float> }`, or a string like "1.0-0.1j".
- `approximate_complex`: optional boolean; if `true` the backend will attempt to produce a
  simple Drude model approximation and run the backend with the approximate dispersive
  parameters. This is a heuristic convenience only.
- `dispersion_fit`: optional object to perform a higher-fidelity fit. Example:

```json
"material": {
  "name": "Au_meas",
  "eps": {"real": 2.1, "imag": -0.8},
  "approximate_complex": true,
  "dispersion_fit": {
    "freqs": [3.0e14, 3.5e14, 4.0e14],
    "eps_values": ["2.1-0.8j", "1.9-0.7j", "1.7-0.6j"]
  }
}
```

#### Notes

- The fitting routine uses a simple Levenberg-Marquardt-like solver to fit a
  3-parameter Drude model (eps_inf, wp, gamma) to the provided spectrum. The
  result is a heuristic approximation and should not be used as a replacement
  for careful optical-model fitting.
- If no `dispersion_fit` is provided, a single-frequency approximation will be
  used. The user is encouraged to provide measured spectral points when
  possible to improve fidelity.
- When an approximation or fit is performed by a backend (e.g., Meep), the
  fitted parameters will be written to `outputs/summary.json` under the key
  `dispersion_fit` with a mapping of material IDs to parameter objects. In
  addition, per-material artifacts will be written to `outputs/dispersion/<id>.json`
  for easier machine consumption. This allows users and tools to inspect the
  fitted model used for the simulation programmatically.
- A convenience endpoint `GET /runs/{id}/dispersion/zip` returns a ZIP of all
  dispersion artifacts for a run (useful for bulk download and archival).

#### Validation (best-effort)

- units check
- passivity hints (warn if active)
- stability heuristics (time step/resolution guidance)

#### References for claims made above

> To be replaced with a proper in-line reference later.

“Measurements often give a complex ε at discrete frequencies (single/few points)”

- Justification: optical constants are usually reported vs wavelength (ellipsometry / tabulated datasets).
- [Refractive Index Database (collection of measured n, k / ε)](https://refractiveindex.info/)
- [ellipsometry context](https://en.wikipedia.org/wiki/Ellipsometry)

“Time‑domain solvers cannot use a non‑causal complex constant ε directly; they need a dispersive model”

- Justification: a frequency-domain complex ε implies frequency-dependent response; causal time-domain simulation  
  requires a causal susceptibility representation (Kramers–Kronig / causality).
- [Kramers–Kronig (causality)](https://en.wikipedia.org/wiki/Kramers%E2%80%93Kronig_relations)
- [Meep docs (dispersive media / susceptibility implementation)](https://meep.readthedocs.io/en/latest/Material_Properties/#drude-susceptibility)

“The Drude model form and meaning of parameters (ε∞, ωp, γ)”

- Justification: Drude is the canonical free‑electron model; formula and parameter meanings are standard.
- [Drude model (overview & formula)](https://en.wikipedia.org/wiki/Drude_model)

“In FDTD the Drude model is implemented via a susceptibility term so fields evolve causally”

- Justification: time-domain codes implement dispersive models as convolution/susceptibility updates (Meep exposes Drude susceptibility).
- [Meep Drude susceptibility docs](https://meep.readthedocs.io/en/latest/Material_Properties/#drude-susceptibility)
- General note on dispersive FDTD: (overview / textbook reference) — see Taflove (FDTD text) and practical notes; 
  e.g. [lecture notes on dispersive FDTD](https://www.ece.uc.edu/~omearaj/lectures/lect15.pdf)

“Drude limitations; use Lorentz / multi‑oscillator for interband / visible structure”

- Justification: Drude captures free‑electron (low‑frequency/plasmonic) behavior;  
  Lorentz oscillators add bound-electron resonances and multi‑oscillator fits represent richer spectra.
- [Lorentz oscillator model](https://en.wikipedia.org/wiki/Lorentz_oscillator_model)
- [Drude + Lorentz (practical fit context)](https://en.wikipedia.org/wiki/Drude_model#Extensions)

“Prefer multi-point dispersion fits (better fidelity than single-frequency Drude approx)”

- Justification: fitting multiple spectral points enables multi‑oscillator or Drude‑Lorentz fits that reproduce spectral features;  
  many datasets and fitting guides use this approach.
- Example & discussion (fitting optical constants): [RefractiveIndex.info guidance and example datasets](https://refractiveindex.info/)

## 5) Post-processing spec (HPC-friendly)

### 5.1 Core operations

- FFT of point/plane signals
- PSD and band-limited power
- Far-field plots (angular distribution)
- Derived quantities: intensity, Poynting vector, field envelopes
- Video export of time slices

### 5.2 Compute model

- Operate on chunked arrays (Zarr)
- Parallelize with **Dask**:
  - Local threaded scheduler for small jobs
  - Dask distributed cluster on HPC for large outputs

**Optional GPU acceleration (workstation)**:

- Prefer libraries with permissive licenses and CPU fallbacks.
- Strategy:
  - Default: NumPy/SciPy (CPU) + Dask
  - Optional: CuPy (CUDA), JAX, or Numba-accelerated kernels when available
  - Always keep a CPU code path so AMD/Intel iGPU users aren’t blocked.

### 5.3 Pipeline definition

A `postprocess/pipeline.json` that declares:

- inputs: monitor IDs
- operations: FFT/PSD/etc.
- outputs: small derived artifacts for UI

## 6) HPC / remote execution

### 6.1 Execution modes

- `local`: runs on workstation (dev)
- `ssh`: submit/run on a remote machine (no scheduler)
- `slurm`: submit to SLURM (primary)
- future: PBS/LSF

**Local mode is a first-class target**:

- Use local multi-core via MPI (when installed) or multi-process execution.
- Support “cancel” reliably (signal the worker process group).

### 6.2 SLURM strategy

- Each run creates a `launch.sh` + `sbatch` template.
- For param sweeps: SLURM job arrays, where each array task points to a parameterized `spec.json`.
- Checkpointing:
  - periodic checkpoints (if backend supports)
  - resume via `--restart`-style flags or equivalent

### 6.3 Cancellation

- UI calls API: cancel run
- API issues `scancel <jobid>` or terminates local process

## 7) UI/UX spec (Vite/React)

### 7.1 Primary user flows

1) Create/Open Project
2) Import geometry (STEP/STL/etc.) → normalize → scene tree
3) Assign materials (library + custom)
4) Define domain + boundaries
5) Place sources
6) Place monitors
7) Choose compute profile (local / cluster profile)
8) Submit run
9) Monitor progress (logs, status)
10) View results + export

### 7.2 UI components

- Scene graph + transform gizmos
- Material browser/editor
- Source/monitor editors
- Run queue + job detail page
- Results viewer: plots + 3D slices + far-field views

### 7.3 3D rendering

- Use WebGL via Three.js / react-three-fiber
- Render geometry preview + monitor regions
- Render decimated field slices / iso-surfaces (from derived artifacts)

### 7.4 Detailed UI elements & workflow walkthrough

This section documents the primary UI elements, their purpose, and typical usage when creating and running a simulation.

Key panels and controls:

- **Project List / Project Page** — create/open projects, list runs, import/export project bundles.
- **Scene / Geometry Editor** — import STL/OBJ/PLY, place primitives, drag/transform geometry, assign materials via the Materials panel.
- **Materials Panel** — browse materials DB, create or edit materials (constant, dispersive models, tensor entries), and apply to geometry.
- **Sources & Monitors** — place sources (time-domain parameterization) and monitors (point, plane, flux).  
  Planar detectors have a **sampling.mode** option ("plane" or "points") and **sampling.nx/ny** settings for point grids.
- **Run Panel** — set compute profile, select backend, optional `python_executable` for Meep runs, submit run, and view log streaming.
- **Results Panel** — accessible from a run page; shows field snapshots (`outputs/fields/*`), monitor CSVs (`outputs/monitors/*.csv`),  
  planar slices (`*_plane_field.json`) and expanded point-grid artifacts (`*_pN_field.json`). The UI groups point-grid children under their  
  plane parent and offers a compact select to pick representative point slices for visualization.
- **Export / Notebook** — "Export report (notebook)" creates a Jupyter notebook pre-populated with run metadata and a recipe  
  to assemble representative frames into an animated GIF.

Walkthrough: Create → Edit → Run

1) Create a project.
2) Import geometry or add primitives in the Scene editor.
3) Assign materials.
4) Place sources and monitors.
5) Open Run panel, select backend and compute profile, then submit.
6) Monitor logs and once complete, open Results Panel to inspect artifacts and export reports.

### 7.5 Choosing a backend — capability guidance

Each backend advertises capabilities. A few common backends and notes:

- **dummy**: development-only synthetic artifact generator for UI and integration testing.  
- **meep** (time-domain FDTD): high-fidelity time-domain fields, supports planar monitors (native plane sampling),  
  MPI scaling, dispersive models.
- **ceviche / scuffem / pygdm**: specialized solvers (frequency-domain or BEM/FEM variants);  
  often do not support native plane sampling and will require client-side expansion of plane monitors into  
  point-grids or server-side translation.

Guidance:

- Choose **meep** for time-domain field sampling, near-to-far transforms, and when MPI or cluster submission is desired.
- Use **dummy** for fast development and deterministic E2E tests.
- For specific frequency-domain tasks (e.g., BEM/FEM), prefer the specialized solvers when you need their native strengths  
  (e.g., frequency sweeps, surface integral-methods).

### 7.6 Troubleshooting & diagnostics

Common issues and how to debug them:

- **Frontend not reachable**: verify the dev server is running on port 5173, check `scripts/sunstone_frontend_diag.py`, and review `frontend` logs.
- **Backend API errors**: inspect `uvicorn` logs, run `pytest` in `backend/` to check for failing unit tests,  
  and use `scripts/sunstone_backend_diag.py` for quick checks.
- **Playwright E2E failures**: our E2E harness runs against a deterministic preview build
  - rerun `./scripts/e2e.sh` locally
  - check the `frontend/playwright-report` HTML artifact
  - ensure `PLAYWRIGHT_BASE_URL` and `VITE_API_BASE_URL` are correct.
- **Canvas / JSDOM test failures**:  
  some UI tests use canvas; ensure tests guard for `HTMLCanvasElement.prototype.getContext` or run tests in an environment with `canvas` installed.

Diagnostic scripts

- `scripts/sunstone_backend_diag.py` — reachability + `pytest` run
- `scripts/sunstone_frontend_diag.py` — reachability + `vitest` + build
- `scripts/e2e.sh` — starts backend + frontend preview and runs Playwright tests
- `scripts/sunstone_fullstack_diag.py` — runs both diagnostics; set `RUN_E2E=1` to execute the full Playwright harness

### 7.7 Unique features & how to use them

- **Spec overrides / translator expansion**:  
  when a backend cannot natively support plane monitors, the translate/submit flow can expand a plane monitor into a point-grid  
  and attach `spec_override` to the run so the worker (or the preprocessor) uses the expanded spec.  
  This is surfaced in the UI and persisted in the run folder under `spec_override.json`.
- **Notebook export with representative frames**:  
  from the Results Panel, export a notebook that embeds a placeholder GIF and contains a small code recipe that,  
  when run, will try to assemble a GIF from representative monitor frames using `imageio`.

## 8) Research extensions (planned modules)

### 8.1 Inverse design

- Define objective functions on monitors (e.g., maximize transmission in band)
- Parameterizations:
  - density/voxel design region
  - CAD parameter hooks
- Optimization:
  - gradient-free: CMA-ES for v0
  - gradient-based: adjoint or differentiable reduced models (v1/v2)

### 8.2 GR / transformation optics

- A generator that maps (metric/transform) → spatial tensor fields ε/μ/(ξ/ζ)
- Meep backend supports anisotropic tensors; bianisotropy is a future capability

### 8.3 “Quantum backend” (scalable approach)

- v1: Classical EM → quantum observables pipeline
  - Extract S-matrix / LDOS / coupling constants
  - Run density-matrix dynamics with QuTiP or a custom graph/mode solver
- v2: Maxwell–Bloch coupling (quantum matter + classical EM)
- v3 (toy-scale): experimental quantized-field or tensor-network backends (separate capability class)

### 8.4 Quantum computer integration

- Use quantum frameworks (Qiskit/Cirq/PennyLane) as optional optimizers/proposal engines
- Keep FDTD as evaluator; quantum hardware is not used to simulate Maxwell directly

## 9) Tech stack (recommended)

### 9.1 Frontend

- Vite + React + TypeScript
- react-three-fiber (Three.js)
- Plotting: Plotly or Vega-Lite
- State: Zustand or Redux Toolkit

### 9.2 Backend control plane

- Python + FastAPI
- Pydantic models for spec validation
- Auth (optional initially): local token, later OAuth
- Storage:
  - file-system run store for v0
  - optional metadata DB later (SQLite/Postgres)

### 9.3 Compute

- Meep + MPI
- Postprocess: numpy/scipy, xarray, zarr, dask

GPU acceleration notes:

- Near-term: accelerate post-processing on GPUs when present.
- Mid/long-term: add a GPU-native solver backend (separate from Meep) if required.
- Prefer open standards where feasible (e.g., OpenCL/SYCL/Vulkan compute) to reduce vendor lock-in.

## 10) Performance principles (mandatory)

- Avoid writing full 3D fields at every timestep.
- Prefer monitors + decimation.
- Use Zarr chunking aligned with typical access patterns.
- Run postprocessing on HPC when outputs are huge.
- Prefer job arrays for sweeps.

Workstation addendum:

- Keep a “small-but-real” regression suite (tiny domains, known analytic/benchmark cases) so you can validate correctness on a single GPU/CPU box.

## 11) Milestones

### Milestone A (v0.1) — “Run a real Meep job from the UI”

- Minimal React UI: upload/import STL, set domain, choose material, add source/monitor, submit job.
- FastAPI backend: create run dir, validate spec, submit local run.
- Meep runner: primitives + STL voxelization.
- Outputs: point monitor + flux spectrum; UI plots.

### Milestone B (v0.2) — “HPC-first: SLURM + artifacts”

- SLURM submit/cancel/status.
- Artifact index + download.
- Zarr output for time series + derived FFT.

### Milestone C (v0.3) — “Materials library + dispersive metals”

- Materials DB + snapshot to run.
- Drude/Lorentz parameter UI.

### Milestone D (v0.4) — “Geometry pipeline expansion”

- STEP import via CAD conversion → mesh → voxelize.
- Better preview + scene graph.

### Milestone E (v1.0) — “Research-grade workflows”

- Param sweeps + job arrays.
- Postprocess pipelines (Dask).
- Near-to-far & far-field visualizations.

### Milestone F (v1.x) — “Inverse design (first version)”

- Objective functions + CMA-ES baseline.
- Optional gradients if/when available.

### Milestone G (v2.x) — “Quantum-adjacent + GR modules”

- Transformation-optics tensor generator.
- Classical→quantum (S-matrix/LDOS) pipeline to QuTiP.
- Maxwell–Bloch coupling prototype.

## 12) Key risks & mitigations

- **Geometry → voxelization quality**: start simple (STL/primitives), validate with known cases, add robust CAD conversion later.
- **Huge IO**: enforce monitor-centric outputs; Zarr chunking; postprocess on HPC.
- **Complex/tensor media stability**: validate passivity; provide warnings; constrain early releases.
- **GPU requirement**: treat Meep as CPU/MPI baseline; add GPU speedups first in postprocessing and later as a separate backend. Keep all GPU features optional with CPU fallback.

## 13) Licensing constraints (explicit)

- Project code: 100% free and open-source.
- Dependencies: prefer OSI-approved licenses (MIT/BSD/Apache/MPL/GPL).
- No license server or paid runtime.
- GPU support should not require proprietary SDKs where avoidable; when unavoidable (e.g., NVIDIA CUDA for CuPy), it must be optional and never the only path.

## 14) License / governance

- License suggestion: MPL-2.0 or Apache-2.0 (permissive) or GPL-3.0 (copyleft). Decide early.
- Encourage reproducibility: run specs + environment snapshots + deterministic artifacts.

---  

## Appendix A — Minimal API endpoints (v0)

- `POST /projects` create project
- `POST /projects/{id}/runs` create run from spec
- `POST /runs/{id}/submit` submit (local/ssh/slurm)
- `POST /runs/{id}/cancel`
- `GET /runs/{id}` status/metadata
- `GET /runs/{id}/logs` tail
- `GET /runs/{id}/artifacts` list
- `GET /runs/{id}/artifacts/{path}` download

## Appendix B — Notes on “full quantum FDTD”

True quantized-field evolution over a 3D grid typically scales exponentially with modes/photons; treat it as...:

- a separate, reduced backend (modes/graphs)
- or toy-scale experiments

... rather than a general feature for large 3D optical structures.  
(unless I suddenly have access to a quantum computer (unlikely))

## 15) Citations & references (selected)

These references are useful for implementing, validating, and extending the platform.

1. Foundations (electromagnetics / optics)
   - J. D. Jackson, *Classical Electrodynamics*, 3rd ed.
   - M. Born and E. Wolf, *Principles of Optics*, 7th ed.
   - L. D. Landau and E. M. Lifshitz, *Electrodynamics of Continuous Media*, 2nd ed. (tensor media, dispersion, constitutive relations).

2. FDTD method + stability/dispersion
   - A. Taflove and S. C. Hagness, *Computational Electrodynamics: The Finite-Difference Time-Domain Method*, 3rd ed. (core FDTD reference).

3. Perfectly matched layers (PML)
   - J.-P. Bérenger, “A perfectly matched layer for the absorption of electromagnetic waves,” *Journal of Computational Physics* (1994).

4. Meep (solver backend)
   - A. F. Oskooi, D. Roundy, M. Ibanescu, P. Bermel, J. D. Joannopoulos, and S. G. Johnson,  
     “Meep: A flexible free-software package for electromagnetic simulations by the FDTD method,” *Computer Physics Communications* 181 (2010).

5. Near-to-far transforms / scattering observables (background)
   - C. A. Balanis, *Advanced Engineering Electromagnetics* (far-field concepts and radiation integrals).

6. Transformation optics / GR-adjacent extensions
   - J. B. Pendry, D. Schurig, and D. R. Smith, “Controlling electromagnetic fields,” *Science* (2006).
   - U. Leonhardt, “Optical conformal mapping,” *Science* (2006).

7. Quantum optics / quantum-adjacent pipelines
   - D. F. Walls and G. J. Milburn, *Quantum Optics*, 2nd ed.
   - C. W. Gardiner and P. Zoller, *Quantum Noise*, 3rd ed.
   - J. R. Johansson, P. D. Nation, and F. Nori, “QuTiP: An open-source Python framework for the dynamics of open quantum systems,” *Computer Physics Communications* (2012).
