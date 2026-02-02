import json
from pathlib import Path
from sunstone_backend.backends.registry import get_backend


import pytest


def test_meep_accepts_diag_tensor(tmp_path: Path):
    pytest.importorskip("meep")
    spec = {
        "domain": {"cell_size": [2e-05, 1.2e-05, 0], "resolution": 40, "dimension": "2d"},
        "materials": [
            {"name": "vac", "type": "isotropic", "epsilon": 1.0},
            {"name": "diag", "type": "anisotropic", "eps_tensor": [[1.0,0,0],[0,2.0,0],[0,0,1.0]]},
        ],
        "geometry": [
            {"type": "block", "size": [5e-07, 3.25e-06, 0], "center": [0, 4.25e-06, 0], "material": "diag"}
        ],
        "sources": [],
        "run_control": {"until": "time", "max_time": 1e-15},
        "resources": {"mode": "local"}
    }
    be = get_backend('meep')
    run_dir = tmp_path / 'run-meep-advanced'
    run_dir.mkdir()
    (run_dir / 'spec.json').write_text(json.dumps(spec))
    # Should not raise and should write summary
    be.run(run_dir)
    out = run_dir / 'outputs' / 'summary.json'
    assert out.exists()


def test_meep_rejects_complex_eps(tmp_path: Path):
    pytest.importorskip("meep")
    spec = {
        "domain": {"cell_size": [2e-05, 1.2e-05, 0], "resolution": 40, "dimension": "2d"},
        "materials": [
            {"name": "vac", "type": "isotropic", "epsilon": 1.0},
            {"name": "met", "type": "isotropic", "eps": {"real": 2.0, "imag": -0.1}},
        ],
        "geometry": [
            {"type": "block", "size": [5e-07, 3.25e-06, 0], "center": [0, 4.25e-06, 0], "material": "met"}
        ],
        "sources": [],
        "run_control": {"until": "time", "max_time": 1e-15},
        "resources": {"mode": "local"}
    }
    be = get_backend('meep')
    run_dir = tmp_path / 'run-meep-advanced'
    run_dir.mkdir()
    (run_dir / 'spec.json').write_text(json.dumps(spec))
    # Should raise a clear error about complex epsilon
    try:
        be.run(run_dir)
        raised = False
    except Exception as e:
        raised = True
        assert 'complex-valued' in str(e) or 'dispersive' in str(e)
    assert raised
