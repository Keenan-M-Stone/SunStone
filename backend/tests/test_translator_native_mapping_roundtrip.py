import json
from pathlib import Path

from sunstone_backend.api.routes.backends import translate_backend


def _write_and_run_and_check(translated_payload: dict, backend_runner_cls, input_key: str, tmp_path: Path):
    run_dir = tmp_path / f"run_{backend_runner_cls.name}"
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "spec.json").write_text(json.dumps(translated_payload))
    runner = backend_runner_cls()
    runner.run(run_dir)
    summary_path = run_dir / "outputs" / "summary.json"
    assert summary_path.exists(), "Backend did not produce summary.json"
    summary = json.loads(summary_path.read_text())
    applied = summary.get("applied", {})
    # Check that backend recorded applied native fragment
    assert input_key in translated_payload, f"Translator did not produce native fragment '{input_key}'"
    assert applied.get("surface_tags", None) is not None


def test_opal_native_fragment_applied(tmp_path: Path):
    spec = {
        "domain": {"dimension": "2d", "cell_size": [1.0, 1.0, 0.0], "resolution": 16},
        "boundary_conditions": [{"face": "px", "type": "pec"}],
    }
    res = translate_backend("opal", spec)
    translated = res["translated"]
    assert "opal_input" in translated
    from sunstone_backend.backends.opal import OpalBackend
    _write_and_run_and_check(translated, OpalBackend, "opal_input", tmp_path)


def test_scuffem_native_fragment_applied(tmp_path: Path):
    spec = {
        "domain": {"dimension": "2d", "cell_size": [1.5, 1.5, 0.0], "resolution": 20},
        "boundary_conditions": [{"face": "py", "type": "pec"}],
    }
    res = translate_backend("scuffem", spec)
    translated = res["translated"]
    assert "scuffem_input" in translated
    from sunstone_backend.backends.scuffem import ScuffemBackend
    _write_and_run_and_check(translated, ScuffemBackend, "scuffem_input", tmp_path)


def test_ceviche_native_fragment_present(tmp_path: Path):
    spec = {
        "domain": {"dimension": "2d", "cell_size": [2.0, 2.0, 0.0], "resolution": 24},
        "boundary_conditions": [{"face": "nx", "type": "pmc"}],
    }
    res = translate_backend("ceviche", spec)
    translated = res["translated"]
    assert "ceviche_input" in translated


def test_pygdm_native_fragment_present(tmp_path: Path):
    spec = {
        "domain": {"dimension": "2d", "cell_size": [1.2, 1.2, 0.0], "resolution": 18},
        "boundary_conditions": [{"face": "py", "type": "pmc"}],
    }
    res = translate_backend("pygdm", spec)
    translated = res["translated"]
    assert "pygdm_input" in translated
