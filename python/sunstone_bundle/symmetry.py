"""Symmetry utilities for deriving invariant tensor forms and simple homogenization helpers.

This module provides:
- invariant_tensor_basis(sym_ops, rank): compute basis of tensors invariant under a set of 3x3 symmetry matrices.
- project_to_invariant(T, basis): project an arbitrary tensor onto the invariant subspace.
- suggest_layered_composite_for_diagonal(eps_target_diag, eps_incl, eps_host): simple Maxwell-Garnett inversion per axis to get volume fractions that approximate a diagonal target tensor using a two-component layered/inclusion model.

Credits:
- spglib (https://atztogo.github.io/spglib/) and pymatgen (https://pymatgen.org/) are useful for extracting symmetry operations from crystal structures; they are not required for these pure linear-algebra utilities but recommended for real structure analysis.
"""
from __future__ import annotations

from typing import List, Tuple
import numpy as np


def _tensor_shape_for_rank(rank: int) -> Tuple[int, ...]:
    return tuple([3] * rank)


def _vec_size(rank: int) -> int:
    return 3 ** rank


def _build_permutation_matrix(R: np.ndarray, rank: int) -> np.ndarray:
    """Return matrix P such that vec(T') = P vec(T) for T'_{i..} = R_{ia} ... T_{a..}.

    P has shape (3^rank, 3^rank).
    """
    # For rank small (1..4), we can build by indexing
    size = _vec_size(rank)
    P = np.zeros((size, size), dtype=float)

    # iterate over all index tuples
    # encode multi-index to linear via base-3
    def idx_to_multi(idx):
        out = []
        for _ in range(rank):
            out.append(idx % 3)
            idx //= 3
        return list(reversed(out))

    def multi_to_idx(m):
        idx = 0
        for v in m:
            idx = idx * 3 + v
        return idx

    for j in range(size):
        jmulti = idx_to_multi(j)
        # compute transformed linear combination
        # for each i multi-index, the coefficient is product of R[i_k, jmulti_k]
        for i in range(size):
            imulti = idx_to_multi(i)
            coeff = 1.0
            for k in range(rank):
                coeff *= R[imulti[k], jmulti[k]]
            if abs(coeff) > 0:
                P[i, j] = coeff
    return P


def invariant_tensor_basis(sym_ops: List[np.ndarray], rank: int = 2, rtol: float = 1e-8) -> Tuple[np.ndarray, int]:
    """Compute a basis (as flattened vectors) for the space of rank-`rank` tensors invariant under all symmetry operations.

    Parameters
    - sym_ops: list of 3x3 orthogonal matrices (numpy arrays)
    - rank: tensor rank (int)

    Returns
    - basis: array of shape (n_basis, 3**rank) where each row is a flattened tensor (row-major lexicographic indices)
    - n_basis: the number of basis elements

    Notes
    - Invariance condition for each R is: P(R) v = v where P(R) implements the linear action on vec(T).
    """
    if rank < 1:
        raise ValueError('rank must be >= 1')
    if any(R.shape != (3, 3) for R in sym_ops):
        raise ValueError('sym_ops must be list of 3x3 matrices')

    size = _vec_size(rank)
    # Stack equations (P - I) v = 0 for each operator
    A_list = []
    I = np.eye(size)
    for R in sym_ops:
        P = _build_permutation_matrix(R, rank)
        A_list.append(P - I)
    A = np.vstack(A_list)

    # Compute nullspace via SVD
    u, s, vh = np.linalg.svd(A)
    tol = max(A.shape) * s[0] * rtol if s.size else rtol
    null_mask = (s <= tol)
    # If no small singular values, still try to pick small ones relative
    nullspace = vh.T[:, -null_mask.sum() :] if null_mask.sum() > 0 else np.zeros((size, 0))

    # Alternatively, use numerical threshold on singular values
    if nullspace.size == 0:
        # try thresholding on small singular values differently
        k = (s / s[0]) <= rtol if s.size else []
        if any(k):
            nullspace = vh.T[:, -k.sum() :]

    # Ensure real
    basis = (nullspace.T).real
    return basis, basis.shape[0]


def project_to_invariant(T: np.ndarray, basis: np.ndarray) -> np.ndarray:
    """Project tensor T (array of shape 3^rank when flattened or multi-dim) onto the invariant subspace spanned by basis rows."""
    v = np.asarray(T).ravel()
    if basis.shape[1] != v.size:
        raise ValueError('basis vectors and tensor size mismatch')
    if basis.shape[0] == 0:
        return np.zeros_like(v)
    # basis rows may not be orthonormal; compute least-squares coefficients
    B = basis.T  # shape (n, m) -> (m, n)
    coeffs, *_ = np.linalg.lstsq(B, v, rcond=None)
    proj = B.dot(coeffs)
    return proj.reshape(v.shape)


# ------------------------- Simple homogenization helper -------------------------
# We'll implement a per-principal-axis Maxwell-Garnett inversion to suggest a volume
# fraction for a two-component inclusion/host mixture that approximates a diagonal
# target permittivity tensor in principal axes.


def _maxwell_garnett_eps(eps_inc: float, eps_host: float, f: float) -> float:
    """Maxwell-Garnett mixing for spherical inclusions (isotropic effective):

    eps_eff = eps_host * (eps_inc + 2 eps_host + 2 f (eps_inc - eps_host)) / (eps_inc + 2 eps_host - f (eps_inc - eps_host))
    """
    num = eps_inc + 2 * eps_host + 2 * f * (eps_inc - eps_host)
    den = eps_inc + 2 * eps_host - f * (eps_inc - eps_host)
    return eps_host * (num / den)


def suggest_layered_composite_for_diagonal(eps_target_diag: np.ndarray, eps_incl: float, eps_host: float) -> np.ndarray:
    """Given a diagonal target permittivity (3,), suggest volume fractions of inclusions along each axis.

    This uses Maxwell-Garnett per-axis (assumes inclusions aligned with principal axes) and solves numerically for f in [0,1).

    Returns vector of fractions f_x, f_y, f_z (clipped to [0, 0.99]).

    Note: this is heuristic and works best for modest contrasts and dilute inclusions.
    """
    from math import isfinite
    eps_target_diag = np.asarray(eps_target_diag, dtype=float).ravel()
    if eps_target_diag.size != 3:
        raise ValueError('eps_target_diag must be length-3 array')

    out = np.zeros(3, dtype=float)
    for i in range(3):
        eps_t = eps_target_diag[i]
        # If eps_t is close to host or incl, choose trivial
        if not isfinite(eps_t):
            out[i] = 0.0
            continue
        if abs(eps_t - eps_host) < 1e-8:
            out[i] = 0.0
            continue
        # Solve for f by scalar root-finding
        # simple bisection
        lo, hi = 0.0, 0.999
        for _ in range(50):
            mid = 0.5 * (lo + hi)
            val = _maxwell_garnett_eps(eps_incl, eps_host, mid)
            if val > eps_t:
                hi = mid
            else:
                lo = mid
        out[i] = 0.5 * (lo + hi)
    return out
