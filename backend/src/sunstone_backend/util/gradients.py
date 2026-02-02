from __future__ import annotations

from typing import Any, Tuple
import math

# Minimal gradient support for materials
# Material expected to contain a key "gradient" with structure depending on type.
# Supported gradient types: 'linear', 'radial', 'angular'
# "eps", "mu", "xi" fields on material may specify "start" and "end" values
# for scalar or 3x3 tensors. We perform simple linear interpolation between
# start and end using a normalized parameter t in [0,1].


def _lerp(a, b, t: float):
    return a * (1 - t) + b * t


def _lerp_tensor(a, b, t: float):
    # assume 3x3 lists
    return [[_lerp(a[i][j], b[i][j], t) for j in range(3)] for i in range(3)]


def sample_gradient(material: dict, pos: Tuple[float, float, float], geom_center: Tuple[float, float, float] | None = None) -> dict:
    """Sample material properties at position `pos` according to material['gradient'].

    Returns a dict with keys 'eps', 'mu', 'xi' similar to a concrete material entry.
    If material has no gradient, returns material's existing eps/mu/xi (if present).
    """
    if not material or 'gradient' not in material:
        out = {}
        for k in ('eps', 'mu', 'xi'):
            if k in material:
                out[k] = material[k]
        return out

    grad = material['gradient']
    gtype = grad.get('type')
    # default origin/center
    cx, cy, cz = geom_center or tuple(grad.get('center', (0.0, 0.0, 0.0)))
    x, y, z = pos
    # compute normalized parameter t
    t = 0.0
    if gtype == 'linear':
        dirv = tuple(grad.get('direction', (1.0, 0.0, 0.0)))
        dx, dy, dz = dirv
        # project pos-c onto dir
        vx, vy, vz = x - cx, y - cy, z - cz
        dot = vx*dx + vy*dy + vz*dz
        # length normalization: use grad.range if provided
        rng = grad.get('range')
        if rng:
            rng_len = float(rng)
            t = (dot / rng_len + 0.5)
        else:
            # no range - use a heuristic normalization (clamp)
            t = max(0.0, min(1.0, dot))
    elif gtype == 'radial':
        dx, dy, dz = x - cx, y - cy, z - cz
        r = math.sqrt(dx*dx + dy*dy + dz*dz)
        rmax = float(grad.get('radius') or grad.get('max_radius') or 1.0)
        t = max(0.0, min(1.0, r / rmax))
    elif gtype == 'angular':
        # compute polar angle in XY plane from center
        dx, dy = x - cx, y - cy
        ang = math.atan2(dy, dx)  # [-pi, pi]
        start = float(grad.get('start_angle', -math.pi))
        end = float(grad.get('end_angle', math.pi))
        # normalize between start and end
        # map ang into [start,end]
        # simple normalization assuming end > start
        span = end - start
        if span == 0:
            t = 0.0
        else:
            rel = (ang - start) / span
            t = max(0.0, min(1.0, rel))
    else:
        t = 0.0

    def interp_field(key: str):
        f = material.get(key)
        if isinstance(f, dict):
            start = f.get('start')
            end = f.get('end')
            if isinstance(start, (int, float)) and isinstance(end, (int, float)):
                return _lerp(start, end, t)
            if isinstance(start, list) and isinstance(end, list):
                # maybe tensor
                return _lerp_tensor(start, end, t)
        # fallback: if scalar or tensor present, return as-is
        return f

    return {k: interp_field(k) for k in ('eps', 'mu', 'xi') if k in material}


def discretize_gradient_over_block(material: dict, block: dict, axis: str = 'x', n_slices: int = 8) -> list:
    """Discretize a gradient material over a block geometry into `n_slices` slices.

    `block` expected to have keys: size: [sx, sy, sz], center: [cx, cy, cz]
    axis in ('x','y','z','radial')

    Returns list of dicts: [{ 'geometry': { type: 'block', size: [...], center: [...] }, 'material': {...} }, ...]
    """
    sx, sy, sz = block.get('size', [1.0, 1.0, 1.0])
    cx, cy, cz = block.get('center', [0.0, 0.0, 0.0])

    slices = []
    if axis not in ('x', 'y', 'z', 'radial'):
        axis = 'x'

    for i in range(n_slices):
        # slice thickness and center offset
        if axis == 'x':
            dx = sx / n_slices
            left = cx - sx/2 + dx * (i + 0.0)
            right = left + dx
            center_x = (left + right) / 2
            slice_geom = {
                'type': 'block',
                'size': [dx, sy, sz],
                'center': [center_x, cy, cz],
            }
            sample_pos = (center_x, cy, cz)
        elif axis == 'y':
            dy = sy / n_slices
            left = cy - sy/2 + dy * i
            right = left + dy
            center_y = (left + right) / 2
            slice_geom = {
                'type': 'block',
                'size': [sx, dy, sz],
                'center': [cx, center_y, cz],
            }
            sample_pos = (cx, center_y, cz)
        elif axis == 'z':
            dz = sz / n_slices
            left = cz - sz/2 + dz * i
            right = left + dz
            center_z = (left + right) / 2
            slice_geom = {
                'type': 'block',
                'size': [sx, sy, dz],
                'center': [cx, cy, center_z],
            }
            sample_pos = (cx, cy, center_z)
        else:  # radial
            # radial slices as concentric shells approximated by annular blocks (approx)
            rmax = max(sx, sy) / 2
            rin = (i / n_slices) * rmax
            rout = ((i + 1) / n_slices) * rmax
            slice_geom = {
                'type': 'annulus',
                'r_in': rin,
                'r_out': rout,
                'center': [cx, cy, cz],
                'height': sz,
            }
            sample_pos = (cx + (rin + rout) / 2, cy, cz)

        mat_sample = sample_gradient(material, sample_pos, geom_center=(cx, cy, cz))
        mat_record = dict(material)
        # replace gradient with concrete sampled fields
        mat_record.pop('gradient', None)
        mat_record.update(mat_sample)
        slices.append({'geometry': slice_geom, 'material': mat_record})

    return slices
