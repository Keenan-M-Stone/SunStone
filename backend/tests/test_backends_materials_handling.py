import json
from pathlib import Path
from sunstone_backend.backends.registry import get_backend


def make_materials_list():
    return [
        {"name": "vac", "type": "isotropic", "epsilon": 1.0},
        {"name": "meta", "type": "anisotropic", "eps": {"real": 2.0, "imag": -0.1}},
    ]


import pytest

def test_backends_accept_list_materials(tmp_path: Path):
    basic_spec = {"domain": {"cell_size": [1.0, 1.0, 0.0]}, "materials": make_materials_list()}
    for name in ['dummy', 'opal', 'ceviche', 'scuffem', 'pygdm', 'meep']:
        if name == 'meep':
            pytest.importorskip('meep')
        be = get_backend(name)
        run_dir = tmp_path / f'run-{name}'
        run_dir.mkdir()
        (run_dir / 'spec.json').write_text(json.dumps(basic_spec))
        # Should not raise when backend normalizes/uses list-style materials
        be.run(run_dir)
        out = run_dir / 'outputs' / 'summary.json'
        assert out.exists(), f"{name} did not write outputs/summary.json"
