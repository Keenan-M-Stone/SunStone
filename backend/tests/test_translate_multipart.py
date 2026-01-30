import json
from pathlib import Path
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app


def test_translate_with_mesh_upload():
    app = create_app()
    client = TestClient(app)

    ex = Path(__file__).parent / "examples" / "opal.json"
    spec = json.loads(ex.read_text())

    files = {
        'spec': (None, json.dumps(spec), 'application/json'),
        'mesh': ('dummy.msh', b'my-mesh-content')
    }
    res = client.post('/backends/opal/translate-multipart', files=files)
    assert res.status_code == 200
    data = res.json()
    assert data['backend'] == 'opal'
    assert data['mesh'] and data['mesh']['filename'] == 'dummy.msh'
    assert 'translated' in data


def test_translate_multipart_missing_mesh_warning():
    app = create_app()
    client = TestClient(app)
    ex = Path(__file__).parent / "examples" / "scuffem.json"
    spec = json.loads(ex.read_text())
    files = {
        'spec': (None, json.dumps(spec), 'application/json')
    }
    res = client.post('/backends/scuffem/translate-multipart', files=files)
    assert res.status_code == 200
    data = res.json()
    assert 'warnings' in data
    assert any('mesh file' in w for w in data['warnings'])
