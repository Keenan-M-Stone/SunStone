from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

from .base import Backend

# Use shared normalization util
from ..util.materials import normalize_materials


def parse_boundary_conditions(bc_spec):
    """Return (pml_specs, boundary_specs).

    - pml_specs: list of dicts: {"direction": "X"/"Y"/"Z"/"ALL", "side": "High"/"Low"/"Both", "thickness": float}
    - boundary_specs: list of dicts: {"direction": "X"/"Y"/"Z", "side": "High"/"Low", "type": "pec"/"pmc"/..., "params": {...}}

    This is a pure-data parser so it can be tested without importing Meep.
    """
    pmls = []
    bcs = []
    # Legacy single pml_thickness support
    if isinstance(bc_spec, dict):
        pml_thickness = bc_spec.get("pml_thickness", None)
        if pml_thickness is not None:
            # pml_thickness may be scalar or list
            try:
                if isinstance(pml_thickness, (list, tuple)):
                    vals = [float(v) for v in pml_thickness]
                    dirs = ["X", "Y", "Z"]
                    for d, v in zip(dirs, vals):
                        if float(v) > 0:
                            pmls.append({"direction": d, "side": "Both", "thickness": float(v)})
                else:
                    v = float(pml_thickness)
                    if v > 0:
                        pmls.append({"direction": "ALL", "side": "Both", "thickness": v})
            except Exception:
                pass
        return pmls, bcs

    # Per-face list support
    if isinstance(bc_spec, list):
        face_map = {"px": ("X", "High"), "nx": ("X", "Low"),
                    "py": ("Y", "High"), "ny": ("Y", "Low"),
                    "pz": ("Z", "High"), "nz": ("Z", "Low")}
        for entry in bc_spec:
            try:
                f = entry.get("face")
                typ = entry.get("type")
                params = entry.get("params", {}) or {}
                if typ == "pml":
                    thickness = params.get("pml_thickness") or params.get("thickness")
                    try:
                        t = float(thickness)
                    except Exception:
                        t = 0.0
                    if t > 0:
                        if f in face_map:
                            dirn, side = face_map[f]
                            pmls.append({"direction": dirn, "side": side, "thickness": t})
                        else:
                            pmls.append({"direction": "ALL", "side": "Both", "thickness": t})
                else:
                    if f in face_map:
                        dirn, side = face_map[f]
                        bcs.append({"direction": dirn, "side": side, "type": typ, "params": params})
                    else:
                        bcs.append({"direction": "ALL", "side": "Both", "type": typ, "params": params})
            except Exception:
                continue
    return pmls, bcs


class MeepBackend(Backend):
    """Experimental backend that runs a minimal Meep simulation.

    Notes:
    - Meep's Python bindings are not necessarily available for the newest Python versions.
      The intended workflow is to run `sunstone-worker` under a separate Python
      interpreter/environment that has Meep installed.
    - This backend is intentionally minimal; it exists to prove out the run-dir contract.
    """

    name = "meep"

    def run(self, run_dir: Path) -> None:
        import logging
        logging.basicConfig(level=logging.INFO)
        logger = logging.getLogger("meep_backend")
        try:
            import meep as mp
            import numpy as np
        except Exception as e:  # pragma: no cover
            raise RuntimeError(
                "Meep backend requested but `import meep` failed. "
                "Create a separate conda env with Meep (often requires an older Python), "
                "then submit with `python_executable` pointing to that env's python. "
                f"Original error: {e}"
            ) from e

        spec = json.loads((run_dir / "spec.json").read_text())

        domain = spec.get("domain", {})
        resolution = int(domain.get("resolution", 20))
        dimension = domain.get("dimension", "2d")
        dim = 2 if str(dimension).lower().startswith("2") else 3
        cell_size = list(domain.get("cell_size", [1.0, 1.0, 0.0]))
        logger.info(f"[MeepBackend] Received cell_size: {cell_size} (dim={dim})")
        if any(s is None or float(s) <= 0 for s in cell_size[:dim]):
            msg = f"Invalid cell size for Meep: {cell_size}. All spatial dimensions must be > 0."
            logger.error(f"[MeepBackend] {msg}")
            raise RuntimeError(msg)
        # For 2D, ensure z is 0, but warn if x or y is 0
        if dim == 2:
            if cell_size[0] == 0 or cell_size[1] == 0:
                raise RuntimeError(f"Invalid 2D cell size: {cell_size}. x and y must be > 0 for Meep 2D.")
            cell_size = [cell_size[0], cell_size[1], 0.0]
        if any(s == 0 for s in cell_size[:dim]):
            raise RuntimeError(f"Invalid cell size: {cell_size}. All spatial dimensions must be > 0.")
        cell = mp.Vector3(*cell_size)

        bc = spec.get("boundary_conditions", {})

        # Parse boundary conditions using a shared pure-data helper
        pml_specs, perface_bcs = parse_boundary_conditions(bc)

        # Convert pml_specs to meep.PML objects when possible
        boundary_layers = []
        try:
            # mp may not be imported yet here; we'll build minimal PML specs and convert once mp is available
            # If the legacy ALL case exists, prefer that as single PML
            all_pml = next((p for p in pml_specs if p.get("direction") == "ALL"), None)
            if all_pml:
                boundary_layers = [mp.PML(thickness=all_pml["thickness"])] if all_pml["thickness"] > 0 else []
            else:
                for p in pml_specs:
                    dir_const = getattr(mp, p["direction"], None)
                    side_const = getattr(mp, p["side"], None)
                    if dir_const is not None and side_const is not None and float(p["thickness"]) > 0:
                        boundary_layers.append(mp.PML(thickness=float(p["thickness"]), direction=dir_const, side=side_const))
        except Exception:
            # If mp not importable here, leave boundary_layers empty; will convert after mp import below
            boundary_layers = []

        materials = normalize_materials(spec.get("materials", {}))

        # Capture any fitted dispersion parameters for inclusion in outputs
        fitted_dispersion: dict[str, dict] = {}

        def material_for(material_id: str):
            info = materials.get(material_id, {})
            model = str(info.get("model") or info.get("type") or "constant").lower()
            if model == "pec":
                return mp.metal
            # Use parser to handle complex scalars and diagonal tensors.
            from sunstone_backend.util.materials import parse_epsilon_for_meep
            try:
                eps_parsed = parse_epsilon_for_meep(info)
            except ValueError as e:
                raise RuntimeError(f"Material '{material_id}' has unsupported eps: {e}")

            # eps_parsed can be: float|complex or ("diag", (ex,ey,ez)) or ("drude_approx", params)
            if isinstance(eps_parsed, tuple) and eps_parsed[0] == "diag":
                ex, ey, ez = eps_parsed[1]
                # Meep accepts anisotropic diagonal via epsilon_diag
                return mp.Medium(epsilon_diag=(ex, ey, ez))

            if isinstance(eps_parsed, tuple) and eps_parsed[0] == "drude_approx":
                params = eps_parsed[1]
                # record params for output
                fitted_dispersion[material_id] = params
                eps_inf = params.get("eps_inf", 1.0)
                wp = params.get("wp")
                gamma = params.get("gamma")
                sigma = params.get("sigma")
                # Create a Drude susceptibility if available in this meep build
                try:
                    suscept = mp.DrudeSusceptibility(frequency=0.0, gamma=gamma, sigma=sigma)
                    return mp.Medium(epsilon=eps_inf, E_susceptibilities=[suscept])
                except Exception:
                    raise RuntimeError("Meep environment does not support Drude susceptibility for approximation")

            # Meep's Simulation checks expect real-valued epsilons for direct
            # constant-permittivity materials. If a complex constant was
            # provided, raise a clear error instructing the user to use
            # dispersive models (Drude/Lorentz) instead of a complex static eps.
            if isinstance(eps_parsed, complex):
                raise RuntimeError(
                    f"Material '{material_id}': complex-valued constant permittivity is not supported by Meep backend. "
                    "Use a dispersive model (Drude/Lorentz) or other backend that accepts complex epsilon."
                )
            return mp.Medium(epsilon=eps_parsed)

        geometry = []
        for geom in spec.get("geometry", []):
            gtype = geom.get("type")
            material = material_for(str(geom.get("material", "vac")))
            center = list(geom.get("center", [0.0, 0.0, 0.0]))
            if dim == 2:
                center = [center[0], center[1], 0.0]
            if gtype == "block":
                size = list(geom.get("size", [0.0, 0.0, 0.0]))
                if dim == 2:
                    if size[0] == 0 or size[1] == 0:
                        raise RuntimeError(f"Invalid 2D block size: {size}. x and y must be > 0 for Meep 2D.")
                    size = [size[0], size[1], mp.inf]
                if any(s == 0 for s in size[:dim]):
                    raise RuntimeError(f"Invalid block size: {size}. All spatial dimensions must be > 0.")
                geometry.append(
                    mp.Block(
                        size=mp.Vector3(*size),
                        center=mp.Vector3(*center),
                        material=material,
                    )
                )
            elif gtype == "cylinder":
                radius = float(geom.get("radius", 0.0))
                height = float(geom.get("height", 0.0))
                if dim == 2:
                    height = mp.inf
                if radius == 0:
                    raise RuntimeError(f"Invalid cylinder radius: {radius}. Must be > 0.")
                geometry.append(
                    mp.Cylinder(
                        radius=radius,
                        height=height,
                        center=mp.Vector3(*center),
                        material=material,
                    )
                )

        sources = []
        for src in spec.get("sources", []):
            center_freq = float(src.get("center_freq", 1.0))
            fwidth = float(src.get("fwidth", center_freq * 0.2))
            component = getattr(mp, str(src.get("component", "Ez")), mp.Ez)
            pos = list(src.get("position", [0.0, 0.0, 0.0]))
            size = list(src.get("size", [0.0, 0.0, 0.0]))
            if dim == 2:
                pos = [pos[0], pos[1], 0.0]
                size = [size[0], size[1], 0.0]
            sources.append(
                mp.Source(
                    src=mp.GaussianSource(frequency=center_freq, fwidth=fwidth),
                    component=component,
                    center=mp.Vector3(*pos),
                    size=mp.Vector3(*size),
                )
            )

        sim = mp.Simulation(
            cell_size=cell,
            resolution=resolution,
            boundary_layers=boundary_layers,
            geometry=geometry,
            sources=sources,
        )

        # Apply per-face (non-PML) boundary conditions where supported by Meep
        for bc_item in perface_bcs:
            try:
                dir_const = getattr(mp, bc_item["direction"], None)
                side_const = getattr(mp, bc_item["side"], None)
                typ = bc_item.get("type")
                if typ == "pec":
                    cond = getattr(mp, "Metallic", None)
                elif typ == "pmc":
                    cond = getattr(mp, "Magnetic", None)
                elif typ == "periodic":
                    logger.warning("Per-face 'periodic' boundary requested; Meep requires paired periodic faces (use k_point) — ignoring per-face periodic setting")
                    continue
                else:
                    logger.warning(f"Unsupported boundary type '{typ}' for Meep backend; ignoring")
                    continue
                if dir_const is not None and side_const is not None and cond is not None:
                    try:
                        sim.set_boundary(side_const, dir_const, cond)
                    except Exception as e:
                        logger.warning(f"Failed to set boundary {bc_item}: {e}")
            except Exception as e:
                logger.warning(f"Error applying per-face boundary {bc_item}: {e}")

        run_control = spec.get("run_control", {})
        max_time = float(run_control.get("max_time", 200))

        monitors = spec.get("monitors", [])
        monitor_meta = {}
        monitor_samples: dict[str, list[dict[str, float]]] = defaultdict(list)
        monitor_groups: dict[float, list[dict]] = defaultdict(list)

        def normalize_component(comp: str) -> str:
            return comp if hasattr(mp, comp) else "Ez"

        for idx, mon in enumerate(monitors):
            mon_id = str(mon.get("id", f"mon-{idx}"))
            pos = list(mon.get("position", [0.0, 0.0, 0.0]))
            if dim == 2:
                pos = [pos[0], pos[1], 0.0]
            comps = [normalize_component(c) for c in mon.get("components", ["Ez"]) or ["Ez"]]
            dt = float(mon.get("dt", 1e-16))
            if dt <= 0:
                dt = 1e-16
            monitor_meta[mon_id] = {"position": pos, "components": comps, "dt": dt}
            monitor_groups[dt].append({"id": mon_id, "position": pos, "components": comps})

        callbacks = []
        for dt, group in monitor_groups.items():
            def make_cb(items):
                def _cb(sim):
                    t = float(sim.meep_time())
                    for item in items:
                        row = {"t": t}
                        for comp in item["components"]:
                            field = getattr(mp, comp)
                            val = sim.get_field_point(field, mp.Vector3(*item["position"]))
                            # Handle complex values: store real part only
                            row[comp] = float(val.real) if hasattr(val, 'real') else float(val)
                        monitor_samples[item["id"]].append(row)

                return _cb

            callbacks.append(mp.at_every(dt, make_cb(group)))

        outputs = spec.get("outputs", {})
        field_movie = outputs.get("field_movie") if isinstance(outputs, dict) else None
        field_snapshot = outputs.get("field_snapshot") if isinstance(outputs, dict) else None
        field_frames: dict[str, list] = defaultdict(list)
        field_times: list[float] = []

        def normalize_component_list(items) -> list[str]:
            if not items:
                return ["Ez"]
            return [normalize_component(c) for c in items]

        if field_movie and dim == 2:
            movie_dt = float(field_movie.get("dt", 1e-15))
            if movie_dt <= 0:
                movie_dt = 1e-15
            stride = int(field_movie.get("stride", 1) or 1)
            if stride < 1:
                stride = 1
            max_frames = int(field_movie.get("max_frames", 0) or 0)
            start_time = float(field_movie.get("start_time", 0.0))
            stop_time = field_movie.get("stop_time")
            stop_time_val = float(stop_time) if stop_time is not None else None
            components = normalize_component_list(field_movie.get("components", ["Ez"]))
            center = list(field_movie.get("center", [0.0, 0.0, 0.0]))
            size = list(field_movie.get("size", cell_size))
            center = [center[0], center[1], 0.0]
            size = [size[0], size[1], 0.0]

            def movie_cb(sim):
                t = float(sim.meep_time())
                if t < start_time:
                    return
                if stop_time_val is not None and t > stop_time_val:
                    return
                if max_frames and len(field_times) >= max_frames:
                    return
                field_times.append(t)
                for comp in components:
                    field = getattr(mp, comp)
                    arr = sim.get_array(
                        component=field,
                        center=mp.Vector3(*center),
                        size=mp.Vector3(*size),
                    )
                    if stride > 1:
                        arr = arr[::stride, ::stride]
                    field_frames[comp].append(arr)

            callbacks.append(mp.at_every(movie_dt, movie_cb))

        if callbacks:
            sim.run(*callbacks, until=max_time)
        else:
            sim.run(until=max_time)

        fields_dir = run_dir / "outputs" / "fields"
        fields_dir.mkdir(parents=True, exist_ok=True)

        if field_snapshot and dim == 2:
            components = normalize_component_list(field_snapshot.get("components", ["Ez"]))
            center = list(field_snapshot.get("center", [0.0, 0.0, 0.0]))
            size = list(field_snapshot.get("size", cell_size))
            stride = int(field_snapshot.get("stride", 1) or 1)
            if stride < 1:
                stride = 1
            center = [center[0], center[1], 0.0]
            size = [size[0], size[1], 0.0]
            snapshot = {}
            for comp in components:
                field = getattr(mp, comp)
                arr = sim.get_array(
                    component=field,
                    center=mp.Vector3(*center),
                    size=mp.Vector3(*size),
                )
                if stride > 1:
                    arr = arr[::stride, ::stride]
                snapshot[comp] = arr
            np.savez_compressed(
                fields_dir / "field_snapshot.npz",
                **snapshot,
                cell_size=np.array(cell_size),
                resolution=resolution,
            )

        field_snapshot_json = outputs.get("field_snapshot_json") if isinstance(outputs, dict) else None
        if field_snapshot_json and dim == 2:
            component = normalize_component(str(field_snapshot_json.get("component", "Ez")))
            center = list(field_snapshot_json.get("center", [0.0, 0.0, 0.0]))
            size = list(field_snapshot_json.get("size", cell_size))
            stride = int(field_snapshot_json.get("stride", 1) or 1)
            if stride < 1:
                stride = 1
            max_size = int(field_snapshot_json.get("max_size", 80) or 80)
            center = [center[0], center[1], 0.0]
            size = [size[0], size[1], 0.0]
            arr = sim.get_array(
                component=getattr(mp, component),
                center=mp.Vector3(*center),
                size=mp.Vector3(*size),
            )
            if stride > 1:
                arr = arr[::stride, ::stride]
            if max(arr.shape) > max_size:
                scale = int(max(arr.shape) / max_size) + 1
                arr = arr[::scale, ::scale]
            payload = {
                "component": component,
                "width": int(arr.shape[1]),
                "height": int(arr.shape[0]),
                "min": float(np.min(arr)),
                "max": float(np.max(arr)),
                "data": arr.astype(float).ravel().tolist(),
            }
            (fields_dir / "field_snapshot.json").write_text(json.dumps(payload))

        if field_movie and dim == 2 and field_times:
            movie_payload = {
                "times": np.array(field_times),
                "cell_size": np.array(cell_size),
                "resolution": resolution,
            }
            for comp, frames in field_frames.items():
                movie_payload[comp] = np.stack(frames)
            np.savez_compressed(fields_dir / "field_movie.npz", **movie_payload)

        monitors_dir = run_dir / "outputs" / "monitors"
        monitors_dir.mkdir(parents=True, exist_ok=True)
        for mon_id, meta in monitor_meta.items():
            rows = monitor_samples.get(mon_id, [])
            if not rows:
                continue
            columns = ["t", *meta["components"]]
            out_path = monitors_dir / f"{mon_id}.csv"
            with out_path.open("w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=columns)
                writer.writeheader()
                writer.writerows(rows)

        summary_obj = {
            "backend": self.name,
            "dimension": dim,
            "notes": "Meep run completed.",
            "monitors": list(monitor_meta.keys()),
            "field_movie": bool(field_movie and dim == 2),
            "field_snapshot": bool(field_snapshot and dim == 2),
            "field_snapshot_json": bool(field_snapshot_json and dim == 2),
        }
        # Include any fitted dispersion parameters (material_id -> params)
        if fitted_dispersion:
            summary_obj["dispersion_fit"] = fitted_dispersion
            # Persist per-material dispersion artifacts for easy programmatic consumption
            disp_dir = run_dir / "outputs" / "dispersion"
            disp_dir.mkdir(parents=True, exist_ok=True)
            for mat_id, params in fitted_dispersion.items():
                (disp_dir / f"{mat_id}.json").write_text(json.dumps(params, indent=2))

        (run_dir / "outputs" / "summary.json").write_text(json.dumps(summary_obj, indent=2))

        # If no JSON snapshot artifact was produced, write a minimal placeholder
        # so the frontend can display a basic live preview for testing.
        placeholder_path = fields_dir / "field_snapshot.json"
        if not placeholder_path.exists():
            try:
                # small default grid
                w = min(64, max(8, int( max(1, resolution/1) )))
                h = w
                data = [0.0] * (w * h)
                payload = {
                    "component": "Ez",
                    "width": w,
                    "height": h,
                    "min": 0.0,
                    "max": 0.0,
                    "data": data,
                }
                placeholder_path.write_text(json.dumps(payload))
                logger.info(f"[MeepBackend] Wrote placeholder field_snapshot.json ({w}x{h})")
            except Exception:
                logger.exception("[MeepBackend] Failed to write placeholder field_snapshot.json")
