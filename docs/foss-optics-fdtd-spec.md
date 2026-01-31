# FOSS Optics FDTD Platform (Meep-first) — Build Plan & Software Spec

Date: 2026-01-22

## 0) Goals (What we’re building)
A free/open-source, HPC-first simulation platform for optical electromagnetics with:
- A modern **Vite/React** UI for geometry import/creation, material assignment, sources/monitors placement, job submission, and results visualization.
- A **Meep-first** FDTD backend with **MPI** scaling on HPC; architecture supports swapping the solver later.
- A robust **materials model** (measured/idealized; complex tensors; dispersion models) and repeatable simulation specs.
- Strong **post-processing** (FFT/PSD, near-to-far, movies, exports) built for large datasets.
- A research-friendly framework where future **transformation-optics/GR**, **inverse design**, and **quantum-adjacent** workflows can be integrated without rewriting the UI.

Workstation-first requirement (for early development/testing):
- Everything must run on a single machine with a multi-core CPU.
- GPU acceleration should be used where it materially helps (especially post-processing), but must have CPU fallbacks.
- No license server / paid runtime dependencies; the full stack must be usable with freely available tooling.

## 1) Non-goals (for the first releases)
- Building a brand-new 3D GPU FDTD kernel from scratch in v0/v1.
- Full QED “quantized field on a 3D grid” as a scalable general feature (research toy backends may exist later, but not the default path).
- Real-time interactive steering during simulation (aside from cancel/pause/resume/checkpoint).

## 2) System-level architecture

### 2.1 Components
1) **Web UI (Vite/React)**
- Geometry pipeline: import STEP/STL/OBJ/PLY (and later CAD authoring), transforms, grouping, labeling.
- Materials assignment UI: browse/search materials DB; set tensor/dispersion; validate passivity/causality where possible.
- Simulation composer: sources, monitors, BCs, resolution, run time, resource profile.
- Job control: submit, monitor, cancel; view logs; download artifacts.
- Results: plots, 3D preview (decimated), spectra, far fields; export.

2) **Control Plane API (Python)**
- Validates simulation specs.
- Manages projects/runs/artifacts.
- Submits jobs to:
  - local execution (developer mode)
  - SSH remote
  - SLURM/PBS (cluster mode)
- Tracks status, logs, metadata.

3) **Solver Worker(s)**
- Executed as a separate process/job (never inside the API server).
- Meep runner reads a run directory and writes standardized artifacts.
- Future solvers implement the same run-spec interface/capabilities.

4) **Post-processing Worker(s)**
- Runs as separate jobs (on the same HPC if needed).
- Uses chunked array storage + parallel compute (Dask recommended).

Workstation default:
- The same worker model is used locally: the API spawns a solver worker process (and optional postprocess worker), so large runs don’t freeze the UI.

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

### 2.2 “Capability-based” backend design (to allow solver swapping)
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

Research note: “plasmonics as a fluid”
- A common approach models conduction electrons as a hydrodynamic fluid coupled to Maxwell’s equations (often called hydrodynamic Drude / nonlocal plasmonics).
- This is conceivable within this platform, but it is not a drop-in Meep setting; it would likely be implemented as (a) a dedicated constitutive/material plugin with extra state variables and spatial-derivative terms, or (b) a separate multiphysics backend.

A backend advertises which capabilities it supports; the UI/API enforces constraints.

## 3) Data model & file formats

### 3.1 Run directory layout (immutable inputs + append-only outputs)
Each run is a folder with a stable ID.

```
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
- Scalars/metadata: JSON
- Arrays/time series:
  - **Zarr** (preferred for chunked parallel IO)
  - HDF5 acceptable as an alternative
- Geometry preview: glTF/GLB for UI rendering; VTK/VTU for scientific export
- Movies: mp4 (via ffmpeg) + optional frame sequences

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
  environment (separate from the control plane). The UI exposes this in the Run panel when the backend
  is set to `meep`.

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

### Using approximate complex permittivity

In some cases a user may have a complex-valued permittivity given at a
single frequency (for example from measurements) but not a full dispersive
model. SunStone supports an explicit *approximation* workflow to create a
simple Drude dispersive model from such a value so backends like Meep can
simulate the material.

Spec fields (material record):

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

Notes:
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


- Tensor ε (anisotropic)

Validation (best-effort):
- units check
- passivity hints (warn if active)
- stability heuristics (time step/resolution guidance)

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

Optional GPU acceleration (workstation):
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

Local mode is a first-class target:
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
True quantized-field evolution over a 3D grid typically scales exponentially with modes/photons; treat it as:
- a separate, reduced backend (modes/graphs)
- or toy-scale experiments
rather than a general feature for large 3D optical structures.

## 15) Citations & references (selected)
These references are useful for implementing, validating, and extending the platform.

Foundations (electromagnetics / optics)
- J. D. Jackson, *Classical Electrodynamics*, 3rd ed.
- M. Born and E. Wolf, *Principles of Optics*, 7th ed.
- L. D. Landau and E. M. Lifshitz, *Electrodynamics of Continuous Media*, 2nd ed. (tensor media, dispersion, constitutive relations).

FDTD method + stability/dispersion
- A. Taflove and S. C. Hagness, *Computational Electrodynamics: The Finite-Difference Time-Domain Method*, 3rd ed. (core FDTD reference).

Perfectly matched layers (PML)
- J.-P. Bérenger, “A perfectly matched layer for the absorption of electromagnetic waves,” *Journal of Computational Physics* (1994).

Meep (solver backend)
- A. F. Oskooi, D. Roundy, M. Ibanescu, P. Bermel, J. D. Joannopoulos, and S. G. Johnson, “Meep: A flexible free-software package for electromagnetic simulations by the FDTD method,” *Computer Physics Communications* 181 (2010).

Near-to-far transforms / scattering observables (background)
- C. A. Balanis, *Advanced Engineering Electromagnetics* (far-field concepts and radiation integrals).

Transformation optics / GR-adjacent extensions
- J. B. Pendry, D. Schurig, and D. R. Smith, “Controlling electromagnetic fields,” *Science* (2006).
- U. Leonhardt, “Optical conformal mapping,” *Science* (2006).

Quantum optics / quantum-adjacent pipelines
- D. F. Walls and G. J. Milburn, *Quantum Optics*, 2nd ed.
- C. W. Gardiner and P. Zoller, *Quantum Noise*, 3rd ed.
- J. R. Johansson, P. D. Nation, and F. Nori, “QuTiP: An open-source Python framework for the dynamics of open quantum systems,” *Computer Physics Communications* (2012).
