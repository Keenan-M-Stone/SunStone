# Ulf — Spacetime Ray‑Tracing & Constitutive Tensor Mapping

**Purpose:**  
Add an interactive UI and computation pipeline for defining curved-spacetime objects (black holes, cosmic strings, cylinders, pulsars, etc.),  
tracing photon trajectories (null geodesics), computing the associated electromagnetic constitutive tensor via Plebanski-type mappings,  
and exporting results as materials or geometry for use in SunStone's EM/CAD workflows.

---

## Executive summary

- Build a carefully scoped MVP that provides an interactive 3D panel ("Ulf") to place spacetime objects and photon sources, compute ray traces (backend jobs),  
  visualize trajectories, and compute/export constitutive tensors sampled along rays.
- Implementation should be staged: UI scaffold → basic static metrics  
  ```
  (Schwarzschild, cosmic string, simple cylinder) 
      → robust geodesic integrator and visualization 
          → Plebanski constitutive mapping and export plumbing 
              → advanced metrics (Kerr/Tipler/pulsar) and performance optimization.
  ```
- Recommendation: implement the compute-heavy components as a separate (but tightly integrated) service or worker module.  
  Keep the UI integrated into SunStone for a unified UX.

---

## MVP scope & roadmap (phased)

### Phase 1 — UI & model plumbing (short)

- Add a new view mode **Ulf** and `UlfPanel` React component that mirrors the CAD panel behavior (show/hide, minimize/maximize, docking).
- Add Ulf settings page with dedicated units section (length/time/mass) separate from CAD/FDTD units.
- Define data models (frontend & backend): `SpacetimeObject`, `PhotonSource`, `TraceRequest`, `TraceResult`, `ConstitutiveTensorSample`.
- Add persistence for Ulf scenes (JSON bundles stored in `data_dir/ulf/`).

### Phase 2 — Simple metrics & visualization (short → medium)

- Implement basic metrics: Schwarzschild (static BH/WH), straight cosmic string, simple cylinder (Tipler approximation),  
  stationary pulsar model (approx), static white hole (time-reversal of Schwarzschild as visualization), 
  and simple Kerr approximations later.
- Implement rendering primitives (spheres, cylinders, strings) and a line/curve renderer to show ray paths.  
  Use existing canvas/renderer code or Three.js if 3D controls required.
- Add controls to place point/beam photon sources and to seed and visualize rays.

### Phase 3 — Geodesic integrator & trace service (medium)

- Create backend endpoints:
  - `POST /ulf/trace` (submit trace job)
  - `GET /ulf/trace/:id` (fetch results)
  - `GET /ulf/metric/:id` (retrieve metric at points)
  - `POST /ulf/export` (export constitutive tensor or geometry/material mapping).
- Implement robust geodesic integration using adaptive RK integrators; support null geodesics (light)  
  and stop criteria (hit horizon, hit object, max affine parameter, sampling distance).
- Implement test cases: analytic Schwarzschild deflection (weak-field), stable circular photon orbits,  
  and energy/momentum conservation checks.

### Phase 4 — Constitutive mapping & export (medium → heavy)

- Implement Plebanski (and equivalent) mapping: metric → ε/μ/ξ tensors sampled at points.  
  Provide per-point constitutive tensor outputs and the ability to average or sample along a trajectory.
- Provide export formats:  
  a) JSON/HDF5 with sampled tensors and metadata;  
  b) a bulk-material JSON format to register new materials in SunStone's materials DB;  
  c) a geometry-generation spec that can be used to construct metamaterial unit-cell approximations externally.
- Add UI to select rays / groups of rays, compute constitutive tensor, preview tensor field visually  
  (tensor glyphs or scalar invariants), and export selected mapping.

### Phase 5 — Advanced metrics & performance (medium → heavy)

- Add full Kerr metric support with Boyer-Lindquist coordinates and address Carter constants for integrating geodesics efficiently.
- Add optional server-side acceleration (JIT via Numba, JAX, or GPU compute), caching of results, and batch processing.
- Add tools for automated geometry generation (simple tilings/groups) to approximate constitutive tensor regions.

---

## System architecture (how Ulf fits into SunStone)

- **Frontend (SunStone)**
  - `UlfPanel` component (React/TSX) with: scene graph, object editor, source editor, trace-controls,  
    inspection panel for selected rays/metrics/tensors, and export UI.
  - Reuse existing CAD canvas style controls (panning, zoom, selection), add 3D camera controls for photon visualizations.
- **Backend**
  - Microservice-style worker (or use existing job runner) to run `trace` jobs. API surface under `/ulf/*`.
  - Job results written to the `data_dir` like other runs: `data_dir/ulf/scene_<id>/trace_<id>.json`  
    (optionally binary formats for large data).
- **Storage & exchange formats**
  - JSON/HDF5 for sampled constitutive tensors; optionally VTK/VTU for visual import into other tools.
  - Export to SunStone materials DB as JSON objects (material parameters & lookup table for tensor mapping).

---

## Numerical methods & algorithmic details

### Geodesic equations (summary)

- Null geodesics satisfy:  
  $$
  
    dx^μ/dλ = k^μ
    dk^μ/dλ = -Γ^μ_{αβ} k^α k^β
  
  $$

  with the null constraint $g_{μν} k^μ k^ν = 0$.

- Integrator requirements:
  - Adaptive step-size (e.g., RK45) to handle strong-field regions near horizons.
  - Enforce null constraint via re-normalization or constraint projection to control numerical drift.
  - Coordinate choices and horizon-regular coordinates may be needed for rays crossing horizons  
    (e.g., Eddington–Finkelstein, Painlevé–Gullstrand).

### Boundary handling & stopping criteria

- Stop when ray crosses event horizon (by checking areal radius thresholds or coordinate-invariants), reaches sampling distance,
  hits an obstacle/given geometry, or exceeds max affine parameter.
- Avoid singularities by aborting or using excision radius.

### Constitutive mapping (Plebanski & covariant formulations)

- Plebanski’s result (classic reference below) gives a mapping from a spacetime metric g_{μν} to effective electromagnetic  
  constitutive relations (ε, μ, and magneto-electric coupling terms) when Maxwell’s equations are expressed in a 3+1 split.
- Implementation notes:
  - Use a consistent sign/units convention across the chain (SI or natural units) and document mapping clearly.
  - Sample metric at ray points, compute 3×3 constitutive tensors, and provide scalar invariants (trace, determinant)  
    and principal values to help visualization/export.

---

## Validation & benchmarks

- **Analytic tests:**
  - Schwarzschild weak-field deflection (deflection ≈ 4GM/b) — numeric integrator should match analytic formula for large impact parameter.
  - Photon sphere radius for Schwarzschild:  
    $r = 3GM (i.e., 1.5 r_s)$ — photons trapped in circular orbit.
  - Conservation of constants of motion (energy, angular momentum, Carter constant for Kerr) where appropriate.
- **Convergence tests:** vary integrator tolerances and show order-of-convergence.
- **Unit tests:** include small synthetic metrics with known analytic geodesics.

---

## Export formats & integration targets

- **Constitutive sample (JSON / HDF5)**
  - `{ points: [ {x,y,z}, ...], metrics: [gvals], tensors: [{eps: [...], mu: [...], xi: [...]}], meta: {...} }`
- **Bulk material registration** — JSON schema compatible with SunStone materials DB (per-frequency or broadband mappings).
- **Geometry generation spec** — an intermediate JSON describing spatial regions and desired effective tensors for use by  
  a geometry-generator tool (external or in-repo) that creates metamaterial microstructures.

---

## Libraries, tools and open-source projects to leverage

- EinsteinPy — Python library for GR utilities and geodesic integration (good starting code and metric definitions)  
  https://github.com/einsteinpy/einsteinpy
  - Docs & geodesics: https://docs.einsteinpy.org/

- GYOTO — general relativistic ray-tracing (C++ with Python bindings). Mature ray-tracing code for images and null geodesic computations.  
  https://github.com/gyoto/gyoto
  - Paper: Vincent et al. (2011) — "GYOTO: a new general relativistic ray-tracing code" (arXiv)  
    https://arxiv.org/abs/1108.4425

- Arcmancer — numerical GR ray-tracing and radiation transfer library (C++/Python)  
  https://github.com/ASGR/Arcmancer

- Black Hole Perturbation Toolkit (analytical machinery around black holes)  
  https://bhptoolkit.org/

- Einstein Toolkit — large-scale GR numerical relativity framework (for heavy simulations / validation)  
  https://einsteintoolkit.org/

- SciPy `solve_ivp` and ODE integrators (for quick prototyping) and Numba / JAX for acceleration  
  https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html

- Foundational electromagnetism & constitutive mapping references:
  - Hehl & Obukhov — *Foundations of Classical Electrodynamics* (Springer, 2003):  
    covariant constitutive relations and constitutive tensor discussion.  
    https://www.springer.com/gp/book/9780817642481

- Classic/seminal papers:
  - Plebanski, J. (1960) — *Electromagnetic Waves in Gravitational Fields*, Phys. Rev. 118, 1396–1408.  
    DOI: https://doi.org/10.1103/PhysRev.118.1396
  - Leonhardt, U. & Philbin, T. G. — *Geometry and Light: The Science of Invisibility*  
    (Oxford Univ. Press) — transformation optics and geometry connections.  
    https://global.oup.com/academic/product/geometry-and-light-9780199231845
  - Pendry, Schurig & Smith (2006) — *Controlling electromagnetic fields*, Science 312, 1780 (Transformation optics foundations)  
    https://doi.org/10.1126/science.1126493

- Known GR references for metrics and geodesics:
  - Chandrasekhar, S. — *The Mathematical Theory of Black Holes* (Cambridge, 1983)
  - Carter, B. (1968) — constants of motion for Kerr metric (Carter constant)

---

## Key theoretical results & supporting proofs (what we'll rely on)

- **Existence and uniqueness of geodesics:** well-established in differential geometry; local numerical integration with  
   adaptive solvers approximates them (control via error tolerances).
- **Plebanski constitutive mapping:** gives closed-form relations mapping a metric to effective electromagnetic constitutive  
   relations in the geometric optics / low-frequency approximation; these relations will be the theoretical backbone  
   to compute ε and μ effective tensors and magneto-electric couplings.
- **Conserved quantities (symmetries):** Killing vectors lead to conserved energy/angular momentum which help both analytic  
  checks and efficient integration (reduce dimensionality or provide integrals for error checking).
- **Weak-field limit checks:** known analytic formulas (deflection ≈ 4GM/b) provide a robust validation case.

(References above give detailed derivations; code should carry tests that numerically validate these relations.)

---

## Validation plan & tests

- **Unit tests:** geodesic integrator vs analytic solutions (Schwarzschild deflection, photon sphere, simple straight-line in flat space).
- **Integration tests:** full scene → trace → Plebanski mapping → export → import into SunStone materials DB  
  and run EM solver on small test problems to check whether EM transmission/refraction behavior matches expectations.
- **Benchmarks:** throughput of traces per second for a suite of scenes; memory & caching behavior.

---

## UX & UI considerations

- Provide an intuitive inspector for per-ray sampling: click a ray, see metric & tensor values sampled at the clicked position and along the ray.
- Ray grouping and averaging: select a group of rays and compute average or representative constitutive tensor  
  (e.g., path-averaged or pointwise along a mean affine parameter position).
- Export flow: allow export as material (register in materials DB) or as geometry hints (JSON) with download of the sample dataset.

---

## Integration recommendation (opinion)

- Implement Ulf as a **hybrid approach**:  
  keep the interactive UI integrated into the main SunStone frontend,
  but implement the heavy compute pipeline as a separate service or worker module.
  - Reasons: numerical GR tools and significant compute/IO/optimization needs are a different engineering surface than CAD/EM workflows.  
    A separate service keeps complexity isolated and enables independent scaling, language choices (C++/Python), and reuse across projects.
  - Tight integration points: API endpoints, file formats (JSON/HDF5), and materials/geometry exports that the main SunStone app can import.

- This hybrid approach minimizes disruption to the main app while making the heavy-lift parts easier to iterate and accelerate later  
(WASM/GPU/C++ backends), and it also allows community tools (EinsteinPy, GYOTO) to be reused with minimal rework.

---

## Next steps (concrete)

1. Create issues & task breakdown for Phase 1 and Phase 2 (UI components, settings, data models, simple metrics + renderer).
2. Prototype Schwarzschild ray tracer using EinsteinPy or a small RK integrator as an internal POC (server-side job). Validate with analytic tests.
3. Implement Plebanski mapping for sample points and a minimal export format. Add export-to-materials hook into the SunStone materials DB.
4. Iterate on UI features (selection, inspection, group averaging) and add caching/acceleration for workloads that require it.

---

## Contact & research notes

Proposal: produce a small `POC` backend that uses `einsteinpy` to trace null geodesics for Schwarzschild metric
and a minimal `UlfPanel` stub in the frontend to visualize results and demonstrate export to the materials DB. 

This will clarify integration points and help get early UX feedback.

---

## Selected bibliography & links (summary)

1. J. Plebanski — *Electromagnetic Waves in Gravitational Fields*, Phys. Rev. 118 (1960), 1396–1408.  
   (Plebanski mapping for metric → effective constitutive relations).  
   https://doi.org/10.1103/PhysRev.118.1396

2. F. W. Hehl & Y. N. Obukhov — *Foundations of Classical Electrodynamics: Charge, Flux, and Metric*,  
   Birkhäuser / Springer (2003). (Covariant constitutive formalism and detailed derivations.)  
   https://www.springer.com/gp/book/9780817642481

3. U. Leonhardt & T. G. Philbin — *Geometry and Light: The Science of Invisibility* (book)  
   and Leonhardt & Philbin papers on transformation optics.  
   (Transformation optics & material analogies to curved space.)  
   https://global.oup.com/academic/product/geometry-and-light-9780199231845

4. J. B. Pendry, D. Schurig & D. R. Smith — *Controlling electromagnetic fields*, Science 312 (2006), 1780.  
  (Foundational paper for metamaterials & transformation optics.)  
  https://doi.org/10.1126/science.1126493

5. S. Chandrasekhar — *The Mathematical Theory of Black Holes*, Cambridge University Press (1983).  
   (Geodesic theory, Kerr solution, integrals of motion.)  
   https://www.cambridge.org/core/books/mathematical-theory-of-black-holes/0A1AD7142D4B4F5C6E8C3EC97E6E9E39

6. F. H. Vincent et al. — *GYOTO: a new general relativistic ray-tracing code* (2011, arXiv).  
   (Open-source GR ray-tracing; useful reference/benchmark.)  
   https://arxiv.org/abs/1108.4425 & https://github.com/gyoto/gyoto

7. EinsteinPy (library) — geodesics, metrics, and utilities.  
   (Useful for prototyping and metric definitions.)  
   https://github.com/einsteinpy/einsteinpy & https://docs.einsteinpy.org/

8. Arcmancer — GR ray tracing & radiative transfer project (C++/Python).  
   https://github.com/ASGR/Arcmancer

9. Black Hole Perturbation Toolkit — analytical tools around BHs.  
   https://bhptoolkit.org/ & https://github.com/BlackHolePerturbationToolkit

10. SciPy `solve_ivp` docs — for ODE integrators used in geodesic integration.  
    https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html

11. Gravitational lensing & validation references:  
    Schneider, Ehlers, Falco — *Gravitational Lenses* (1992) and standard GR textbooks (Weinberg, Misner/Thorne/Wheeler).

---

*Drafted: 2026-01-31 — SunStone team*
