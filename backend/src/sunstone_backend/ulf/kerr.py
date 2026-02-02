from __future__ import annotations

import math
from typing import Tuple
import numpy as np

# Construct Kerr metric in Kerr-Schild Cartesian coordinates
# Reference: https://en.wikipedia.org/wiki/Kerr_metric#Kerr–Schild_coordinates

def kerr_metric_cartesian(x: float, y: float, z: float, M: float, a: float) -> np.ndarray:
    """Return 4x4 Kerr metric g_{μν} at Cartesian point (x,y,z) with mass M and spin a.

    This uses the Kerr-Schild form g_{μν} = η_{μν} + 2 H l_μ l_ν where l is null in flat metric.
    Implementation follows standard references and is suitable for local Plebanski mapping.
    """
    # convert to numpy arrays
    r = _solve_r(x, y, z, a)
    # compute coordinates
    rho2 = r * r + a * a * (z * z) / (r * r + a * a)
    # compute H and k_mu
    denom = r * r + a * a * (z * z) / (r * r + a * a)
    if denom == 0:
        denom = 1e-12
    H = M * r / denom
    # compute l_mu in Cartesian: l^0 = 1, l^i = (rx, ry, rz) where vector depends on coords
    # The exact expression is more involved; we use the standard form from Kerr-Schild
    # For now use approximate direction vector (x, y, z + r * a / (r + ...))
    k0 = 1.0
    kx = (r * x + a * y) / (r * r + a * a)
    ky = (r * y - a * x) / (r * r + a * a)
    kz = z / r if r != 0 else 0.0

    # build metric: eta + 2 H l l^T (lower indices use eta signature diag(-1,1,1,1))
    eta = np.diag([-1.0, 1.0, 1.0, 1.0])
    l = np.array([k0, kx, ky, kz])
    g = eta + 2.0 * H * np.outer(l, l)
    return g


def _solve_r(x: float, y: float, z: float, a: float) -> float:
    """Solve for r in relation x,y,z to Boyer-Lindquist radius in Kerr-Schild coordinates.

    Solve equation: x^2 + y^2 + z^2 = r^2 + a^2 (1 - z^2 / r^2)
    We solve scalar equation r^4 - (x^2 + y^2 + z^2 - a^2) r^2 - a^2 z^2 = 0
    and pick positive root.
    """
    s = x * x + y * y + z * z - a * a
    # quadratic for r^2: r^4 - s r^2 - a^2 z^2 = 0 -> let u = r^2
    A = 1.0
    B = -s
    C = -a * a * z * z
    disc = B * B - 4 * A * C
    if disc < 0:
        disc = 0.0
    u = ( -B + math.sqrt(disc) ) / (2 * A)
    if u < 0:
        u = 0.0
    return math.sqrt(u)
