# Group & Representation Theory utilities for effective constitutive relations

This document describes the new utilities added to SunStone for working with point-group symmetries and deriving invariant forms of constitutive tensors (e.g., permittivity).

## What was added

- `python/sunstone_bundle/symmetry.py` — utilities to compute invariant tensor bases under a set of 3x3 symmetry operations and to project arbitrary tensors into that invariant subspace. Also includes a simple helper to propose a layered/inclusion-based approximating composite (Maxwell-Garnett-based) for diagonal tensors.

- Tests: `python/tests/test_symmetry.py` verifies basic correctness for rank-2 invariants and the layered composite helper.

## How it works (summary)

- Given a set of symmetry operations (3x3 orthogonal rotation/reflection matrices), the module builds the linear action on the flattened tensor indices for a given rank `r` and solves for the nullspace of `(P(R) - I)` for all `R` to find the invariant subspace. The basis vectors returned are flattened tensors.

- `project_to_invariant` allows you to take an arbitrary tensor and compute its nearest (least-squares) invariant approximation.

- `suggest_layered_composite_for_diagonal` is a pragmatic helper that uses Maxwell-Garnett mixing per principal axis to find volume fractions of a two-component inclusion/host composite that approximate a target diagonal permittivity tensor. This is a heuristic, but useful for initial design exploration.

## Credits

- For extracting symmetry operations from full crystal structures, consider using:
  - `spglib` (https://atztogo.github.io/spglib/) — robust symmetry-finding for crystals.
  - `pymatgen` (https://pymatgen.org/) — convenience utilities and structures parsing.

These packages are added to `environment.yml` so you can use them in notebooks or scripts that call the `symmetry` utilities.

## Limitations & next steps

- The invariant computation is purely algebraic and agnostic of the physics (it only enforces symmetry invariance). For high-rank constitutive tensors (e.g., bianisotropic 4th-order tensors) the nullspace is larger and will need careful physical interpretation.

- The reverse-design helper (`suggest_layered_composite_for_diagonal`) is a simple, per-axis Maxwell-Garnett inversion. A full structure-synthesis pipeline (topology optimization, parameterized meta-atom libraries, or genetic search) would be a follow-up to produce realizable unit cells that match a target tensor more closely.

If you'd like, I can add an example notebook that demonstrates extracting symmetry from a crystal (via `pymatgen`/`spglib`) and using `invariant_tensor_basis` to derive the reduced parameterization for a permittivity tensor and then tuning a layered composite to match it.

Usage in the GUI

- **Symmetry analysis**: select `Symmetry analysis` from the Run Settings `Analysis mode` and set the tensor rank (2 for permittivity). Create and Submit a run; the analysis job will return a `symmetry_summary` describing the invariant basis and projection.
- **Synthesis**: select `Synthesis` in the Run Settings, choose a preset (Layered/Inclusions), select the `Synthesis` backend, and Submit the run. The Synthesis backend will write generated bundles into `outputs/bundles/*.sunstone.json` and an index `outputs/synthesis_index.json` which you can download and import into a CAD tab.

Credits

- For symmetry and structure handling, we rely on `spglib` and `pymatgen`. For mesh and bundle handling, see `python/sunstone_bundle` utilities.

