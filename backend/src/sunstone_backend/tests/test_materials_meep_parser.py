from sunstone_backend.util.materials import parse_epsilon_for_meep
import pytest


def test_parse_simple_scalar():
    info = {"eps": 2.5}
    assert parse_epsilon_for_meep(info) == 2.5


def test_parse_complex_dict():
    info = {"eps": {"real": 1.0, "imag": -0.2}}
    val = parse_epsilon_for_meep(info)
    assert isinstance(val, complex)
    assert abs(val.real - 1.0) < 1e-12
    assert abs(val.imag + 0.2) < 1e-12


def test_parse_complex_string():
    info = {"eps": "1.0-0.1j"}
    val = parse_epsilon_for_meep(info)
    assert isinstance(val, complex)
    assert abs(val.real - 1.0) < 1e-12


def test_parse_diag_tensor():
    tensor = [[1.0, 0.0, 0.0], [0.0, 2.0, 0.0], [0.0, 0.0, 1.0]]
    info = {"eps_tensor": tensor}
    val = parse_epsilon_for_meep(info)
    assert isinstance(val, tuple) and val[0] == "diag"
    assert val[1] == (1.0, 2.0, 1.0)


def test_parse_offdiag_tensor_raises():
    tensor = [[1.0, 0.1, 0.0], [0.0, 2.0, 0.0], [0.0, 0.0, 1.0]]
    info = {"eps_tensor": tensor}
    with pytest.raises(ValueError):
        parse_epsilon_for_meep(info)
