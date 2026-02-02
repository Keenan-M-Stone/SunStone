# Generating geometries from material parameters and extracting materials from geometries

This short guide shows how to use the synthesis and symmetry features in SunStone to (a) generate candidate microstructures that approximate target material tensors, and (b) extract reduced constitutive parameterizations from existing geometries.

## Quick overview
- `Symmetry analysis` (Run Panel) derives the constrained form (invariant subspace) of a constitutive tensor under a specified point/group symmetry.
- `Synthesis` (Synthesis backend) generates candidate bundles (CAD + materials) that approximate a target tensor using heuristic generators (layered stacks and aligned inclusions). Downloaded bundles can be imported into any CAD tab.

## A — Generate geometries from material parameters (Synthesis)
1. In the CAD workspace, set up a project and open the **Run** panel (Show Run).
2. In the **Run Settings** popout, choose **Analysis mode → Synthesis**.
3. Pick a **Synthesis preset** (Layered or Inclusions) and optionally adjust inclusion/host permittivity targets under the `Synthesis` section in Run Settings.
4. Select `Synthesis` as the run backend (from the backend dropdown) — the new *Synthesis* backend will generate bundles in the run outputs.
5. Click **Create Run** then **Submit Run**. Wait for the run to complete. When done, open the Inspector or click **Fetch generated bundles** in the Run panel to download generated bundles.
6. Import a generated `.sunstone.json` bundle using File ▸ Import ▸ Bundle, or open the downloaded bundle in a CAD tab to inspect and modify it further.

Notes:
- The current generation strategy is heuristic (Maxwell-Garnett-based layer stacks and aligned-inclusion presets). For better matches, use the generated bundle as a starting point for further optimization.

## B — Derive material parameters from geometries (Symmetry & projection)
1. If you have a geometry and want its effective constitutive form under symmetry constraints, open the **Run** panel and select **Analysis mode → Symmetry**.
2. Choose the tensor rank (e.g., 2 for permittivity) and create+submit a run (backend can be any compute-capable backend or a short analytic job in the UI).
3. The analysis will produce a `symmetry_summary.json` (for symmetry runs) describing the invariant tensor basis and a least-squares projection of the computed or provided tensor into the invariant subspace.

Alternative (scripted / notebook):
- Use the `python/sunstone_bundle/symmetry.py` utilities directly: import `invariant_tensor_basis` and `project_to_invariant` and feed them with symmetry operation matrices (e.g., extracted from crystal structures using `pymatgen`/`spglib`). This is useful for batch analyses or notebook-driven workflows.

## Tips & next steps
- Use **Synthesis** for rapid prototyping and **Symmetry analysis** for rigorous parameter reductions that simplify simulations.
- For high-fidelity reverse synthesis (a microstructure that *exactly* matches a target tensor), consider using optimization-in-the-loop (topology optimization / genetic search with an EM solver); this is a longer-term work item.

## Credits
- Symmetry extraction: `spglib` and `pymatgen` are recommended for extracting point-group symmetry operations from crystal structures.
- Synthesis heuristics: based on Maxwell–Garnett mixing and simple geometric templates.
