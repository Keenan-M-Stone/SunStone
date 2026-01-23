from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import matplotlib.pyplot as plt


@dataclass
class BundleManifest:
    format: str
    version: str
    name: str
    mode: str
    dimension: str
    created_at: str
    cad_path: str
    spec_path: str
    extra: dict[str, Any]


@dataclass
class BundleCad:
    materials: list[dict[str, Any]]
    geometry: list[dict[str, Any]]
    sources: list[dict[str, Any]]
    monitors: list[dict[str, Any]]
    domain: dict[str, Any]
    view: dict[str, Any] | None = None
    waveforms: list[dict[str, Any]] | None = None
    meshes: list[dict[str, Any]] | None = None


@dataclass
class BundleSpec:
    spec: dict[str, Any]


@dataclass
class Bundle:
    manifest: BundleManifest
    cad: BundleCad
    spec: dict[str, Any]


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_bundle(bundle_dir: Path) -> Bundle:
    manifest = BundleManifest(**_read_json(bundle_dir / "manifest.json"))
    cad = BundleCad(**_read_json(bundle_dir / manifest.cad_path))
    spec = _read_json(bundle_dir / manifest.spec_path)
    return Bundle(manifest=manifest, cad=cad, spec=spec)


def load_bundle_json(path: Path) -> Bundle:
    payload = _read_json(path)
    manifest = BundleManifest(**payload["manifest"])
    cad = BundleCad(**payload["cad"])
    spec = payload["spec"]
    return Bundle(manifest=manifest, cad=cad, spec=spec)


def print_summary(bundle: Bundle) -> None:
    cad = bundle.cad
    print("Bundle:", bundle.manifest.name)
    print("  Mode:", bundle.manifest.mode, "Dimension:", bundle.manifest.dimension)
    print("  Materials:", len(cad.materials))
    print("  Geometry:", len(cad.geometry))
    print("  Sources:", len(cad.sources))
    print("  Monitors:", len(cad.monitors))
    if cad.waveforms:
        print("  Waveforms:", len(cad.waveforms))
    if cad.meshes:
        print("  Meshes:", len(cad.meshes))


def _material_color_map(materials: Iterable[dict[str, Any]]) -> dict[str, str]:
    color_map: dict[str, str] = {}
    for m in materials:
        color_map[str(m.get("id"))] = str(m.get("color", "#94a3b8"))
    return color_map


def render_cad(bundle: Bundle, ax: plt.Axes | None = None, z_slice: float = 0.0) -> plt.Axes:
    cad = bundle.cad
    colors = _material_color_map(cad.materials)
    if ax is None:
        _, ax = plt.subplots(figsize=(6, 4))

    for g in cad.geometry:
        shape = g.get("shape") or g.get("type")
        cx, cy = g.get("center", [0, 0])[:2]
        size = g.get("size", [0, 0])
        sx, sy = size[0], size[1]
        material = g.get("materialId") or g.get("material")
        color = colors.get(str(material), "#94a3b8")

        if shape == "block":
            ax.add_patch(
                plt.Rectangle((cx - sx / 2, cy - sy / 2), sx, sy, color=color, alpha=0.4)
            )
        elif shape == "cylinder":
            r = abs(sx) * 0.5
            ax.add_patch(plt.Circle((cx, cy), r, color=color, alpha=0.4))
        elif shape == "polygon":
            pts = g.get("points") or []
            if pts:
                ax.add_patch(plt.Polygon(pts, closed=True, color=color, alpha=0.3))
        elif shape == "polyline":
            pts = g.get("points") or []
            if pts:
                xs, ys = zip(*pts)
                ax.plot(xs, ys, color=color, linewidth=1.5)
        elif shape == "arc":
            arc = g.get("arc") or {}
            start = arc.get("start")
            end = arc.get("end")
            r = arc.get("radius", 0)
            if start and end:
                ax.plot([start[0], end[0]], [start[1], end[1]], color=color, linewidth=1.5)

    for s in cad.sources:
        x, y = s.get("position", [0, 0])[:2]
        ax.scatter([x], [y], c="#f59e0b", marker="^", s=40, label="source")

    for m in cad.monitors:
        x, y = m.get("position", [0, 0])[:2]
        ax.scatter([x], [y], c="#22d3ee", marker="s", s=26, label="monitor")

    ax.set_aspect("equal", "box")
    ax.set_title(f"CAD Model (z={z_slice:g})")
    ax.set_xlabel("x (m)")
    ax.set_ylabel("y (m)")
    return ax


def _waveform_series(bundle: Bundle, waveform_id: str | None = None, source_id: str | None = None):
    cad = bundle.cad
    waveforms = cad.waveforms or []
    if source_id:
        source = next((s for s in cad.sources if s.get("id") == source_id), None)
        if source and source.get("waveformId"):
            waveform_id = source.get("waveformId")

    if waveform_id:
        wf = next((w for w in waveforms if w.get("id") == waveform_id), None)
    else:
        wf = waveforms[0] if waveforms else None

    if wf is None:
        return None

    kind = wf.get("kind", "samples")
    data = wf.get("data", {})

    if kind == "samples":
        t = np.array(data.get("t", []), dtype=float)
        y = np.array(data.get("value", []), dtype=float)
        return t, y

    if kind == "analytic":
        typ = data.get("type", "sine")
        amp = float(data.get("amplitude", 1.0))
        freq = float(data.get("frequency", 1.0))
        phase = float(data.get("phase", 0.0))
        t = np.linspace(0, float(data.get("duration", 1e-12)), 800)
        if typ == "gaussian":
            t0 = float(data.get("t0", t.mean()))
            sigma = float(data.get("sigma", t.max() * 0.1))
            y = amp * np.exp(-((t - t0) ** 2) / (2 * sigma * sigma)) * np.cos(2 * np.pi * freq * t + phase)
        else:
            y = amp * np.cos(2 * np.pi * freq * t + phase)
        return t, y

    return None


def plot_waveform(bundle: Bundle, waveform_id: str | None = None, source_id: str | None = None):
    series = _waveform_series(bundle, waveform_id, source_id)
    if series is None:
        raise ValueError("No waveform data available.")
    t, y = series
    plt.figure(figsize=(6, 3))
    plt.plot(t, y)
    plt.title("Waveform")
    plt.xlabel("Time (s)")
    plt.ylabel("Amplitude")
    plt.tight_layout()


def plot_waveform_fft(bundle: Bundle, waveform_id: str | None = None, source_id: str | None = None):
    series = _waveform_series(bundle, waveform_id, source_id)
    if series is None:
        raise ValueError("No waveform data available.")
    t, y = series
    if len(t) < 2:
        raise ValueError("Need at least two samples for FFT.")
    dt = np.mean(np.diff(t))
    freqs = np.fft.rfftfreq(len(t), dt)
    fft = np.abs(np.fft.rfft(y))
    plt.figure(figsize=(6, 3))
    plt.semilogy(freqs, fft + 1e-12)
    plt.title("Waveform FFT")
    plt.xlabel("Frequency (Hz)")
    plt.ylabel("Magnitude")
    plt.tight_layout()


def load_monitor_series(run_dir: Path, monitor_id: str, component: str = "Ez"):
    path = run_dir / "outputs" / "monitors" / f"{monitor_id}.csv"
    if not path.exists():
        raise FileNotFoundError(path)
    rows = np.genfromtxt(path, delimiter=",", names=True)
    t = rows["t"]
    y = rows[component]
    return t, y


def plot_monitor_series(run_dir: Path, monitor_id: str, component: str = "Ez"):
    t, y = load_monitor_series(run_dir, monitor_id, component)
    plt.figure(figsize=(6, 3))
    plt.plot(t, y)
    plt.title(f"Monitor {monitor_id} ({component})")
    plt.xlabel("Time (s)")
    plt.ylabel(component)
    plt.tight_layout()


def plot_monitor_fft(run_dir: Path, monitor_id: str, component: str = "Ez"):
    t, y = load_monitor_series(run_dir, monitor_id, component)
    dt = np.mean(np.diff(t))
    freqs = np.fft.rfftfreq(len(t), dt)
    fft = np.abs(np.fft.rfft(y))
    plt.figure(figsize=(6, 3))
    plt.semilogy(freqs, fft + 1e-12)
    plt.title(f"Monitor {monitor_id} FFT")
    plt.xlabel("Frequency (Hz)")
    plt.ylabel("Magnitude")
    plt.tight_layout()


def export_field_movie(run_dir: Path, out_path: Path, component: str = "Ez", fps: int = 20):
    try:
        import imageio.v2 as imageio
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("imageio is required for exporting movies") from exc

    movie_path = run_dir / "outputs" / "fields" / "field_movie.npz"
    if not movie_path.exists():
        raise FileNotFoundError(movie_path)

    data = np.load(movie_path)
    if component not in data:
        raise KeyError(f"{component} not in movie data")

    frames = data[component]
    images = []
    vmin, vmax = np.min(frames), np.max(frames)
    for frame in frames:
        norm = (frame - vmin) / (vmax - vmin + 1e-12)
        img = (plt.cm.viridis(norm)[:, :, :3] * 255).astype(np.uint8)
        images.append(img)

    imageio.mimsave(out_path, images, fps=fps)
