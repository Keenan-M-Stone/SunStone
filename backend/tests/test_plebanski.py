import numpy as np
from sunstone_backend.ulf.geodesics import plebanski_from_metric, plebanski_tensor_from_metric


def test_plebanski_flat_metric():
    g = np.diag([-1.0, 1.0, 1.0, 1.0])
    res = plebanski_from_metric(g)
    eps = np.array(res['eps'])
    mu = np.array(res['mu'])
    xi = np.array(res['xi'])
    zeta = np.array(res['zeta'])
    # eps and mu ~ -identity under our sign convention (vacuum mapping)
    assert eps.shape == (3, 3)
    assert mu.shape == (3, 3)
    assert np.allclose(eps, -np.eye(3), atol=1e-6)
    assert np.allclose(mu, -np.eye(3), atol=1e-6)
    # xi and zeta ~ zero
    assert np.allclose(xi, np.zeros((3, 3)), atol=1e-8)
    assert np.allclose(zeta, np.zeros((3, 3)), atol=1e-8)


def test_plebanski_nonzero_g0i():
    v = 0.1
    g = np.array([
        [-1.0, v, 0.0, 0.0],
        [v, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ])
    res = plebanski_from_metric(g)
    xi = np.array(res['xi'])
    zeta = np.array(res['zeta'])
    # Expect non-trivial magneto-electric coupling
    assert not np.allclose(xi, 0.0)
    assert not np.allclose(zeta, 0.0)


def test_plebanski_tensor_from_metric_consistency():
    # Compare plebanski_tensor_from_metric for Schwarzschild with plebanski_from_metric applied to constructed metric
    x, y, z = 1.0, 0.0, 0.0
    M = 0.5
    eps1, mu1, xi1, zeta1 = plebanski_tensor_from_metric(x, y, z, M)
    # construct isotropic metric and call general routine
    rho = (x * x + y * y + z * z) ** 0.5
    half = M / (2.0 * rho)
    denom = 1.0 + half
    A = (1.0 - half) / denom
    B = denom * denom
    g = np.zeros((4, 4))
    g[0, 0] = -A * A
    for i in range(1, 4):
        g[i, i] = B
    res = plebanski_from_metric(g)
    eps2 = np.array(res['eps'])
    mu2 = np.array(res['mu'])
    # They should be close (xi/zeta should be near zero)
    assert np.allclose(eps1, eps2, atol=1e-8)
    assert np.allclose(mu1, mu2, atol=1e-8)
