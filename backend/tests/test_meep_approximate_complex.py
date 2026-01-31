import json
from pathlib import Path
from sunstone_backend.backends.registry import get_backend


def test_meep_approximates_complex_eps(tmp_path: Path):
    spec = {
        "domain": {"cell_size": [2e-05, 1.2e-05, 0], "resolution": 40, "dimension": "2d"},
        "materials": [
            {"name": "vac", "type": "isotropic", "epsilon": 1.0},
            {"name": "met", "type": "isotropic", "eps": {"real": 2.0, "imag": -0.1}, "approximate_complex": True},
        ],
        "geometry": [
            {"type": "block", "size": [5e-07, 3.25e-06, 0], "center": [0, 4.25e-06, 0], "material": "met"}
        ],
        "sources": [
            {"type": "gaussian_pulse", "center_freq": 3.75e14, "fwidth": 1e12, "component": "Ez", "position": [-9e-06, 0, 0], "size": [0, 1.08e-05, 0], "waveform_id": "wf-sine"}
        ],
        "run_control": {"until": "time", "max_time": 1e-15},
        "resources": {"mode": "local"}
    }
    be = get_backend('meep')
    run_dir = tmp_path / 'run-meep-approx'
    run_dir.mkdir()
    (run_dir / 'spec.json').write_text(json.dumps(spec))
    # Should not raise and should write summary using drude approximation
    be.run(run_dir)
    out = run_dir / 'outputs' / 'summary.json'
    assert out.exists()
