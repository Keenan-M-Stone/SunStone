import json
from pathlib import Path
from sunstone_backend.backends.registry import get_backend


def test_meep_writes_dispersion_fit_to_summary(tmp_path: Path):
    spec = {
        "domain": {"cell_size": [2e-05, 1.2e-05, 0], "resolution": 40, "dimension": "2d"},
        "materials": [
            {"name": "met", "eps": {"real": 2.0, "imag": -0.1}, "approximate_complex": True},
        ],
        "geometry": [
            {"type": "block", "size": [5e-07, 3.25e-06, 0], "center": [0, 0, 0], "material": "met"}
        ],
        "sources": [],
        "run_control": {"until": "time", "max_time": 1e-15},
        "resources": {"mode": "local"}
    }
    be = get_backend('meep')
    run_dir = tmp_path / 'run-meep-disp'
    run_dir.mkdir()
    (run_dir / 'spec.json').write_text(json.dumps(spec))
    be.run(run_dir)
    summary = json.loads((run_dir / 'outputs' / 'summary.json').read_text())
    assert 'dispersion_fit' in summary
    assert 'met' in summary['dispersion_fit']
    params = summary['dispersion_fit']['met']
    assert 'eps_inf' in params and 'wp' in params and 'gamma' in params
