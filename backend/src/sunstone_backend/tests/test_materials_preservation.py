from sunstone_backend.util.materials import normalize_materials


def test_preserve_complex_eps():
    # complex epsilon represented as a dict should be preserved
    mlist = [
        {"name": "meta", "type": "anisotropic", "eps": {"real": 2.0, "imag": -0.1}},
    ]
    out = normalize_materials(mlist)
    assert "meta" in out
    assert isinstance(out["meta"].get("eps"), dict)
    assert out["meta"]["eps"]["real"] == 2.0
    assert out["meta"]["eps"]["imag"] == -0.1


def test_preserve_tensor():
    # tensor stored as nested list should be preserved unchanged
    tensor = [[1.0, 0.0, 0.0], [0.0, 2.0, 0.0], [0.0, 0.0, 1.0]]
    mlist = [{"name": "tensor_mat", "type": "anisotropic", "eps_tensor": tensor}]
    out = normalize_materials(mlist)
    assert "tensor_mat" in out
    assert out["tensor_mat"].get("eps_tensor") == tensor
