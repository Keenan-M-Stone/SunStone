import numpy as np
from sunstone_backend.ulf.geodesics import plebanski_from_metric, plebanski_tensor_from_kerr
from sunstone_backend.ulf.kerr import kerr_metric_cartesian


def test_plebanski_kerr_nonzero_xi_zeta():
    # pick a point off-axis to see frame-dragging effects
    x, y, z = 3.0, 1.0, 0.2
    M = 1.0
    a = 0.8
    eps, mu, xi, zeta = plebanski_tensor_from_kerr(x, y, z, M, a)
    xi = np.array(xi)
    zeta = np.array(zeta)
    assert xi.shape == (3, 3)
    assert zeta.shape == (3, 3)
    # Expect nonzero magneto-electric coupling for rotating mass
    assert not np.allclose(xi, 0.0)
    assert not np.allclose(zeta, 0.0)


def test_plebanski_from_metric_matches_kerr_helper():
    x, y, z = 2.0, 0.5, 0.1
    M = 1.0
    a = 0.5
    g = np.array(kerr_metric_cartesian(x, y, z, M, a))
    res = plebanski_from_metric(g)
    e1 = np.array(res['eps'])
    e2, m2, xi2, zeta2 = plebanski_tensor_from_kerr(x, y, z, M, a)
    e2 = np.array(e2)
    assert e1.shape == e2.shape
    assert np.allclose(e1, e2, atol=1e-8)
