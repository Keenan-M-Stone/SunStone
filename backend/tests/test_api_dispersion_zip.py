from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings
import json
from pathlib import Path


def test_download_dispersion_zip(tmp_path: Path):
    settings = get_settings()
    settings.data_dir = tmp_path
    app = create_app()
    client = TestClient(app)

    # Create run and dispersion files
    res = client.post('/projects', json={'name': 'zip-test'})
    proj = res.json()
    res = client.post(f"/projects/{proj['id']}/runs", json={'spec': {'domain': {'cell_size': [1,1,0]}}})
    run = res.json()
    run_id = run['id']
    run_dir = Path(settings.data_dir) / 'runs' / f'run_{run_id}'
    disp_dir = run_dir / 'outputs' / 'dispersion'
    disp_dir.mkdir(parents=True)
    (disp_dir / 'a.json').write_text(json.dumps({'eps_inf':1.0}))
    (disp_dir / 'b.json').write_text(json.dumps({'eps_inf':2.0}))

    r = client.get(f"/runs/{run_id}/dispersion/zip")
    assert r.status_code == 200
    assert r.headers.get('content-type') == 'application/zip'
    # Save temporarily and check zip contents
    import zipfile, io
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = z.namelist()
    assert 'a.json' in names and 'b.json' in names
