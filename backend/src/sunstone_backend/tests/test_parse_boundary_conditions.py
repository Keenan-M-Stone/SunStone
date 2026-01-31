from sunstone_backend.backends.meep import parse_boundary_conditions


def test_parse_legacy_scalar_pml():
    spec = {"pml_thickness": 0.2}
    pmls, bcs = parse_boundary_conditions(spec)
    assert len(pmls) == 1
    assert pmls[0]["direction"] == "ALL"
    assert pmls[0]["thickness"] == 0.2
    assert bcs == []


def test_parse_legacy_list_pml():
    spec = {"pml_thickness": [0.1, 0.0, 0.3]}
    pmls, bcs = parse_boundary_conditions(spec)
    assert any(p["direction"] == "X" and p["thickness"] == 0.1 for p in pmls)
    assert any(p["direction"] == "Z" and p["thickness"] == 0.3 for p in pmls)


def test_parse_perface_list():
    spec = [
        {"face": "px", "type": "pml", "params": {"pml_thickness": 0.2}},
        {"face": "py", "type": "pml", "params": {"pml_thickness": 0.1}},
        {"face": "nx", "type": "pec"},
    ]
    pmls, bcs = parse_boundary_conditions(spec)
    assert any(p["direction"] == "X" and p["side"] == "High" and p["thickness"] == 0.2 for p in pmls)
    assert any(p["direction"] == "Y" and p["side"] == "High" and p["thickness"] == 0.1 for p in pmls)
    assert any(b["direction"] == "X" and b["side"] == "Low" and b["type"] == "pec" for b in bcs)
