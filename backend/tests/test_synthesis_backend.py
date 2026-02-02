import json
from pathlib import Path
from sunstone_backend.backends.synthesis import SynthesisBackend


def test_synthesis_backend_generates_bundles(tmp_path: Path):
    spec = {
        "domain": {"cell_size": [1.0, 1.0, 0], "resolution": 10, "dimension": "2d"},
        "materials": {
            "vac": {"id": "vac", "label": "vac", "eps": 1.0},
        },
        "run_options": {"analysis_mode": "synthesis"},
        "synthesis": {"preset": "layered", "incl_eps": 5.0, "host_eps": 1.0},
    }
    run_dir = tmp_path / 'run'
    run_dir.mkdir()
    (run_dir / 'spec.json').write_text(json.dumps(spec))
    be = SynthesisBackend()
    be.run(run_dir)
    outputs = run_dir / 'outputs'
    assert (outputs / 'synthesis_index.json').exists()
    idx = json.loads((outputs / 'synthesis_index.json').read_text())
    assert 'bundles' in idx
    for bname in idx['bundles']:
        assert (outputs / 'bundles' / bname).exists()
