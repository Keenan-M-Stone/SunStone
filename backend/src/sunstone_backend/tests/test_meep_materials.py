from sunstone_backend.util.materials import normalize_materials


def test_normalize_materials_from_list():
    mlist = [
        {"name": "vac", "type": "isotropic", "epsilon": 1.0},
        {"name": "pec", "type": "pec", "epsilon": 1.0},
    ]
    out = normalize_materials(mlist)
    assert isinstance(out, dict)
    assert "vac" in out and "pec" in out
    assert out["pec"].get("model") == "pec"
    assert out["pec"].get("eps") == 1.0


def test_normalize_materials_from_dict_passthrough():
    md = {"vac": {"model": "constant", "eps": 1.0}}
    out = normalize_materials(md)
    assert out is md or (isinstance(out, dict) and out["vac"]["eps"] == 1.0)
