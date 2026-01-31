import numpy as np
from sunstone_backend.util.materials import fit_drude_to_spectrum


def drude_eps(omega, eps_inf, wp, gamma):
    return eps_inf - (wp ** 2) / (omega ** 2 + 1j * gamma * omega)


def test_fit_recovers_parameters():
    eps_inf = 2.0
    wp = 1e16
    gamma = 1e14
    freqs = np.linspace(3.0e14, 4.5e14, 6)
    omegas = 2 * np.pi * freqs
    eps_vals = [drude_eps(w, eps_inf, wp, gamma) for w in omegas]
    params = fit_drude_to_spectrum(freqs, eps_vals)
    assert abs(params['eps_inf'] - eps_inf) < 0.5
    assert abs(params['wp'] - wp) / wp < 0.5
    assert abs(params['gamma'] - gamma) / gamma < 1.0
