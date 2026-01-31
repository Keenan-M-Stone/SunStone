from sunstone_backend.util.materials import approximate_drude_from_complex


def test_approximate_drude_returns_params():
    eps = complex(2.0, -0.1)
    params = approximate_drude_from_complex(eps, center_freq_hz=3.0e14)
    assert "eps_inf" in params and "wp" in params and "gamma" in params and "sigma" in params
    assert params["eps_inf"] >= 1.0
