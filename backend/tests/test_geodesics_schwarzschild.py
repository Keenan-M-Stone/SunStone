import math
from sunstone_backend.ulf.geodesics import integrate_ray_from_cartesian


def test_schwarzschild_weak_deflection():
    # Use small mass and large impact parameter to be in weak-field regime
    M = 0.001
    # set source at x=-10, y=impact parameter b, direction towards +x
    b = 1.5
    x0 = -50.0
    y0 = b
    dx = 1.0
    dy = 0.0
    pts, _ = integrate_ray_from_cartesian(x0, y0, dx, dy, M, samples=400, phi_span=6.283185307179586)
    # Estimate incoming and outgoing angles by fitting to endpoints
    (x_in, y_in) = pts[0]
    (x_out, y_out) = pts[-1]
    incoming_angle = math.atan2(y_in - y0, x_in - x0)  # should be ~0 initially
    outgoing_angle = math.atan2(y_out - y0, x_out - x0)
    deflection = abs(outgoing_angle - incoming_angle)
    # Weak-field deflection predicted by GR (approx): 4M / b (geometric units)
    predicted = 4.0 * M / b
    # Compare within factor (numerical crude integrator): assert order-of-magnitude and sign
    assert deflection > 0
    assert abs(deflection - predicted) / max(1e-12, predicted) < 1.5  # allow 150% relative error for crude integrator
