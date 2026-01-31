from sunstone_backend.api.routes.backends import translate_backend


def test_ceviche_translator_reports_pml_and_warnings():
    spec = {
        "boundary_conditions": [
            {"face": "px", "type": "pml", "params": {"thickness": 2}},
            {"face": "py", "type": "pec"},
        ]
    }

    res = translate_backend("ceviche", spec)
    assert res["backend"] == "ceviche"
    # API-level warnings should include PML-unsupported message
    assert any("PML" in w or "PML" in str(w) for w in res["warnings"])

    translated = res["translated"]
    assert isinstance(translated, dict)
    assert "boundaries" in translated
    assert translated["boundaries"]["pml_specs"] != []
    assert any(b.get("type") == "pec" for b in translated["boundaries"]["other"]) 


def test_opal_translator_ignores_pml_but_reports_boundaries():
    spec = {"boundary_conditions": [{"face": "nx", "type": "pml", "params": {"thickness": 1}}, {"face": "nz", "type": "pec"}]}
    res = translate_backend("opal", spec)
    assert res["backend"] == "opal"
    # Opal translator returns warnings for PML
    assert any("PML" in w or "PML" in str(w) for w in res["warnings"])
    translated = res["translated"]
    assert translated["boundaries"]["pml_specs"] != []
    assert any(b.get("type") == "pec" for b in translated["boundaries"]["other"]) 


def test_pygdm_and_scuffem_translators_include_boundaries_and_warnings():
    spec = {"boundary_conditions": [{"face": "pz", "type": "pml", "params": {"thickness": 3}}]}
    res_pygdm = translate_backend("pygdm", spec)
    res_scuff = translate_backend("scuffem", spec)

    assert any("PML" in w or "PML" in str(w) for w in res_pygdm["warnings"]) 
    assert any("PML" in w or "PML" in str(w) for w in res_scuff["warnings"]) 
    assert res_pygdm["translated"]["boundaries"]["pml_specs"] != []
    assert res_scuff["translated"]["boundaries"]["pml_specs"] != []
