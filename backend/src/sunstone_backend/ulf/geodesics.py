from __future__ import annotations

import math
from typing import List, Tuple

# Simple Schwarzschild null-orbit integrator using the orbit equation
# du/dphi = v, dv/dphi = 3 M u^2 - u
# where u = 1/r, phi is angular coordinate, M is mass (geometric units G=c=1)
# We integrate as an IVP in phi with RK4 stepping. This is a simplified 2D equatorial-plane integrator.

def integrate_schwarzschild_orbit(u0: float, v0: float, M: float, phi_start: float, phi_end: float, n_steps: int) -> List[Tuple[float, float]]:
    """Integrate the orbit equation for u(φ) returning list of (r, phi) points.

    Parameters
    ----------
    u0: initial u = 1/r0
    v0: initial du/dφ
    M: mass parameter (in geometric units)
    phi_start, phi_end: integration range
    n_steps: number of steps

    Returns
    -------
    List of (r, phi) points of length n_steps+1
    """
    def f(u, v):
        du = v
        dv = 3.0 * M * u * u - u
        return du, dv

    h = (phi_end - phi_start) / n_steps
    u = u0
    v = v0
    phi = phi_start
    out: List[Tuple[float, float]] = []
    for i in range(n_steps + 1):
        r = 1.0 / u if u != 0 else float('inf')
        out.append((r, phi))
        # RK4 for system
        du1, dv1 = f(u, v)
        du2, dv2 = f(u + 0.5 * h * du1, v + 0.5 * h * dv1)
        du3, dv3 = f(u + 0.5 * h * du2, v + 0.5 * h * dv2)
        du4, dv4 = f(u + h * du3, v + h * dv3)
        u = u + (h / 6.0) * (du1 + 2 * du2 + 2 * du3 + du4)
        v = v + (h / 6.0) * (dv1 + 2 * dv2 + 2 * dv3 + dv4)
        phi = phi + h
    return out


def orbit_initial_conditions_from_cartesian(x0: float, y0: float, dx: float, dy: float, M: float) -> Tuple[float, float]:
    """Convert initial position (x0,y0) and direction vector (dx,dy) to orbit variables u0 and v0.

    We assume motion in equatorial plane with phi measured from x-axis and polar coordinates r, phi.
    The orbit equation uses u(φ)=1/r with derivative du/dφ = -(cosθ / r^2)*dr/dθ etc. For initialization we compute:
    - phi0 = atan2(y0, x0)
    - r0 = sqrt(x0^2 + y0^2)
    - the initial direction angle alpha measured wrt increasing phi direction (tangential) is computed from dx,dy.

    For a photon moving with direction vector (dx,dy), the relation between du/dφ and dr/dφ and derivatives leads to du/dφ = -(1/r^2) dr/dφ / (dφ/dλ) * (dλ cancels) — this is derived numerically here by computing instantaneous derivatives.

    For simplicity we compute du/dφ numerically: if the direction vector points with components dr/dλ = (dx,dy) dot radial unit vector, and r dφ/dλ = (dx,dy) dot tangential unit vector. Then du/dφ = (du/dλ) / (dφ/dλ) where du/dλ = - (1/r^2) dr/dλ.
    """
    phi0 = math.atan2(y0, x0)
    r0 = math.hypot(x0, y0)
    if r0 == 0:
        r0 = 1e-12
    # radial unit vector
    rx = x0 / r0
    ry = y0 / r0
    # tangential unit vector (increasing phi direction)
    tx = -ry
    ty = rx
    # dr/dλ (component of (dx,dy) along radial)
    dr_dl = dx * rx + dy * ry
    # r dφ/dλ (component along tangential)
    r_dphi_dl = dx * tx + dy * ty
    # handle degenerate case
    if abs(r_dphi_dl) < 1e-12:
        # purely radial — set a small tangential component to avoid singularity
        r_dphi_dl = 1e-6
    du_dlambda = - (1.0 / (r0 * r0)) * dr_dl
    dphi_dlambda = r_dphi_dl / r0
    v0 = du_dlambda / dphi_dlambda
    u0 = 1.0 / r0
    return u0, v0


def integrate_ray_from_cartesian(x0: float, y0: float, dx: float, dy: float, M: float, samples: int = 200, phi_span: float = 6.283185307179586) -> Tuple[List[Tuple[float, float]], List[float]]:
    """Integrate an orbit starting from cartesian position and direction; return list of (x,y) and list of r values (for metric sampling)

    - phi_span: how much φ to integrate forward (radians)
    """
    u0, v0 = orbit_initial_conditions_from_cartesian(x0, y0, dx, dy, M)
    phi0 = math.atan2(y0, x0)
    half = phi_span / 2.0
    phi_start = phi0 - half
    phi_end = phi0 + half
    pts_rphi = integrate_schwarzschild_orbit(u0, v0, M, phi_start, phi_end, samples - 1)
    out: List[Tuple[float, float]] = []
    r_values: List[float] = []
    for r, phi in pts_rphi:
        x = r * math.cos(phi)
        y = r * math.sin(phi)
        out.append((x, y))
        r_values.append(r)
    return out, r_values


# Plebanski-style constitutive mapping (weak-field isotropic approximation)
# For metric in isotropic weak field: g_{00} = -(1+2Phi), g_{ij} = (1-2Phi) delta_{ij}
# with Phi = -GM/r (Newtonian potential). We use first-order mapping:
# eps^{ij} = mu^{ij} = (1 - 2 * Phi) * delta^{ij}


def plebanski_tensor_from_r(r: float, M: float, G: float = 1.0) -> Tuple[List[List[float]], List[List[float]]]:
    """Deprecated: weak-field isotropic approximation kept for compatibility.

    Prefer `plebanski_tensor_from_metric(x,y,z,M)` for more accurate mapping.
    """
    if r <= 0:
        r = 1e-12
    Phi = - (G * M) / r
    factor = 1.0 - 2.0 * Phi
    eps = [[0.0] * 3 for _ in range(3)]
    mu = [[0.0] * 3 for _ in range(3)]
    for i in range(3):
        eps[i][i] = factor
        mu[i][i] = factor
    return eps, mu


import numpy as _np
from .kerr import kerr_metric_cartesian


def plebanski_tensor_from_metric(x: float, y: float, z: float, M: float) -> Tuple[List[List[float]], List[List[float]]]:
    """Compute constitutive (eps, mu, xi, zeta) tensors at cartesian position (x,y,z) for a Schwarzschild mass M

    This function constructs the isotropic Schwarzschild metric in isotropic coordinates and then calls
    the general `plebanski_from_metric` routine to compute the full constitutive mapping including
    magneto-electric couplings.
    """
    rho = max((x * x + y * y + z * z) ** 0.5, 1e-12)
    m = float(M)
    half = m / (2.0 * rho)
    denom = 1.0 + half
    if denom == 0:
        denom = 1e-12
    A = (1.0 - half) / denom
    B = denom * denom
    # construct 4x4 metric in isotropic coordinates: diag(-A^2, B, B, B)
    g = _np.zeros((4, 4), dtype=float)
    g[0, 0] = -A * A
    for i in range(1, 4):
        g[i, i] = B
    # get full Plebanski mapping
    res = plebanski_from_metric(g)
    eps = res['eps']
    mu = res['mu']
    xi = res['xi']
    zeta = res['zeta']
    return eps, mu, xi, zeta


def plebanski_from_metric(g4: _np.ndarray) -> dict:
    """Compute Plebanski constitutive tensors (eps, mu, xi, zeta) from a 4x4 metric g_{μν}.

    Returns dict with 3x3 lists 'eps', 'mu', 'xi', 'zeta'.

    Algorithm (numerical): For basis inputs of E_j and H_j construct antisymmetric F_{αβ},
    compute H^{μν} = sqrt(-g) g^{μα} g^{νβ} F_{αβ}, then extract D^i = H^{0i} and B^i = 1/2 ε^{ijk} H_{jk}.
    Columns give the constitutive matrices.
    """
    g4 = _np.asarray(g4, dtype=float)
    detg = _np.linalg.det(g4)
    if detg >= 0:
        # In non-Lorentzian inputs, proceed but warn
        detg = float(detg)
    sqrt_neg_g = _np.sqrt(abs(-detg))
    invg = _np.linalg.inv(g4)

    # 3D Levi-Civita (epsilon_{ijk}) with indices 0..2
    eps3 = _np.zeros((3, 3, 3), dtype=float)
    eps3[0, 1, 2] = 1.0
    eps3[0, 2, 1] = -1.0
    eps3[1, 0, 2] = -1.0
    eps3[1, 2, 0] = 1.0
    eps3[2, 0, 1] = 1.0
    eps3[2, 1, 0] = -1.0

    eps_mat = _np.zeros((3, 3), dtype=float)
    mu_mat = _np.zeros((3, 3), dtype=float)
    xi_mat = _np.zeros((3, 3), dtype=float)
    zeta_mat = _np.zeros((3, 3), dtype=float)

    # Helper to compute H^{μν} = sqrt(-g) * invg @ F @ invg.T
    def compute_H_from_F(F):
        return sqrt_neg_g * (invg @ F @ invg.T)

    # For each basis vector in E (unit vector along axis j)
    for j in range(3):
        F = _np.zeros((4, 4), dtype=float)
        # F_{0j} = E_j, indices offset by 1 for spatial
        F[0, j + 1] = 1.0
        F[j + 1, 0] = -1.0
        H = compute_H_from_F(F)
        # D^i = H^{0i}
        D = H[0, 1:4].copy()
        # B^i = 1/2 epsilon^{ijk} H_{jk}
        B = _np.zeros(3, dtype=float)
        for i in range(3):
            s = 0.0
            for p in range(3):
                for q in range(3):
                    s += 0.5 * eps3[i, p, q] * H[p + 1, q + 1]
            B[i] = s
        eps_mat[:, j] = D
        zeta_mat[:, j] = B

    # For each basis vector in H (magnetic basis b_j = 1)
    for j in range(3):
        F = _np.zeros((4, 4), dtype=float)
        # F_{kl} = -epsilon_{klj}
        for k in range(3):
            for l in range(3):
                F[k + 1, l + 1] = -eps3[k, l, j]
        # ensure antisymmetry
        F = 0.5 * (F - F.T)
        H = compute_H_from_F(F)
        D = H[0, 1:4].copy()
        B = _np.zeros(3, dtype=float)
        for i in range(3):
            s = 0.0
            for p in range(3):
                for q in range(3):
                    s += 0.5 * eps3[i, p, q] * H[p + 1, q + 1]
            B[i] = s
        xi_mat[:, j] = D
        mu_mat[:, j] = B

    return {
        'eps': _np.array(eps_mat).tolist(),
        'mu': _np.array(mu_mat).tolist(),
        'xi': _np.array(xi_mat).tolist(),
        'zeta': _np.array(zeta_mat).tolist(),
    }


def plebanski_tensor_from_kerr(x: float, y: float, z: float, M: float, a: float) -> Tuple[List[List[float]], List[List[float]], List[List[float]], List[List[float]]]:
    """Compute plebanski tensors at (x,y,z) for Kerr mass M and spin a using Kerr-Schild metric."""
    g = kerr_metric_cartesian(x, y, z, M, a)
    res = plebanski_from_metric(g)
    return res['eps'], res['mu'], res['xi'], res['zeta']

