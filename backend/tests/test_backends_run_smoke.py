import json
import tempfile
from pathlib import Path

from sunstone_backend.backends.registry import get_backend


def test_backend_runs_write_summary(tmp_path: Path):
    basic_spec = {"domain": {"cell_size": [1.0, 1.0, 0.0]}}
    for name in ['dummy', 'opal', 'ceviche', 'scuffem', 'pygdm']:
        be = get_backend(name)
        run_dir = tmp_path / f'run-{name}'
        run_dir.mkdir()
        (run_dir / 'spec.json').write_text(json.dumps(basic_spec))
        # Should not raise
        be.run(run_dir)
        out = run_dir / 'outputs' / 'summary.json'
        assert out.exists(), f"{name} did not write outputs/summary.json"
