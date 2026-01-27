from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

from .base import Backend


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
        pml_thickness = bc.get("pml_thickness", [0.0, 0.0, 0.0])
        try:
            pml_value = max(float(v) for v in pml_thickness)
        except Exception:
            pml_value = 0.0
        boundary_layers = [mp.PML(thickness=pml_value)] if pml_value > 0 else []

        materials = spec.get("materials", {})

        def material_for(material_id: str):
            info = materials.get(material_id, {})
            model = str(info.get("model", "constant")).lower()
            if model == "pec":
                return mp.metal
            eps = float(info.get("eps", 1.0))
            return mp.Medium(epsilon=eps)

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

        (run_dir / "outputs" / "summary.json").write_text(
            json.dumps(
                {
                    "backend": self.name,
                    "dimension": dim,
                    "notes": "Meep run completed.",
                    "monitors": list(monitor_meta.keys()),
                    "field_movie": bool(field_movie and dim == 2),
                    "field_snapshot": bool(field_snapshot and dim == 2),
                    "field_snapshot_json": bool(field_snapshot_json and dim == 2),
                },
                indent=2,
            )
        )
