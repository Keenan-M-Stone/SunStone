import json
from pathlib import Path

from sunstone_backend.api.routes.backends import translate_backend
from sunstone_backend.backends.opal import OpalBackend
from sunstone_backend.backends.scuffem import ScuffemBackend


def _write_and_run(translated_payload: dict, backend_runner, tmp_path: Path):
    run_dir = tmp_path / f"run_{backend_runner.name}"
    run_dir.mkdir(parents=True, exist_ok=True)
    # Write translated payload as spec.json for backend run
    (run_dir / "spec.json").write_text(json.dumps(translated_payload))
    backend_runner.run(run_dir)
    summary_path = run_dir / "outputs" / "summary.json"
    assert summary_path.exists(), "Backend did not produce summary.json"
    summary = json.loads(summary_path.read_text())
    # Ensure boundary/surface info was preserved in the spec keys seen by backend
    assert any(k in summary.get("spec_keys", []) for k in ("boundaries", "surface_conditions"))


def test_opal_surface_conditions_mapped_and_run(tmp_path):
    spec = {
        "domain": {"dimension": "2d", "cell_size": [1.0, 1.0, 0.0], "resolution": 16},
        "boundary_conditions": [
            {"face": "px", "type": "pec"},
            {"face": "nx", "type": "pmc"},
        ],
    }

    res = translate_backend("opal", spec)
    assert res["backend"] == "opal"
    translated = res["translated"]
    assert isinstance(translated, dict)
    # Translator should produce explicit surface_conditions
    assert "surface_conditions" in translated
    assert len(translated["surface_conditions"]) >= 1

    _write_and_run(translated, OpalBackend(), tmp_path)


def test_scuffem_surface_conditions_mapped_and_run(tmp_path):
    spec = {
        "domain": {"dimension": "2d", "cell_size": [1.5, 1.5, 0.0], "resolution": 20},
        "boundary_conditions": [
            {"face": "py", "type": "pec"},
            {"face": "pz", "type": "periodic"},
        ],
    }

    res = translate_backend("scuffem", spec)
    assert res["backend"] == "scuffem"
    translated = res["translated"]
    assert isinstance(translated, dict)
    assert "surface_conditions" in translated
    assert len(translated["surface_conditions"]) >= 1

    _write_and_run(translated, ScuffemBackend(), tmp_path)


def test_ceviche_surface_conditions_mapped_and_run(tmp_path):
    spec = {
        "domain": {"dimension": "2d", "cell_size": [2.0, 2.0, 0.0], "resolution": 24},
        "boundary_conditions": [
            {"face": "px", "type": "pec"},
            {"face": "nz", "type": "periodic"},
        ],
    }

    res = translate_backend("ceviche", spec)
    assert res["backend"] == "ceviche"
    translated = res["translated"]
    assert isinstance(translated, dict)
    assert "surface_conditions" in translated
    assert len(translated["surface_conditions"]) >= 1

    # Ceviche translator returns a payload suitable for Ceviche backend preview; run the CevicheBackend using the translated payload
    from sunstone_backend.backends.ceviche import CevicheBackend
    _write_and_run(translated, CevicheBackend(), tmp_path)


def test_pygdm_surface_conditions_mapped_and_run(tmp_path):
    spec = {
        "domain": {"dimension": "2d", "cell_size": [1.2, 1.2, 0.0], "resolution": 18},
        "boundary_conditions": [
            {"face": "py", "type": "pmc"},
        ],
    }

    res = translate_backend("pygdm", spec)
    assert res["backend"] == "pygdm"
    translated = res["translated"]
    assert isinstance(translated, dict)
    assert "surface_conditions" in translated
    assert len(translated["surface_conditions"]) >= 1

    from sunstone_backend.backends.pygdm import PyGDMBackend
    _write_and_run(translated, PyGDMBackend(), tmp_path)
