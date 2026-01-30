import json
from pathlib import Path
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app


def test_mesher_endpoint_basic():
    app = create_app()
    client = TestClient(app)

    spec = {"geometry": [{"type": "block", "size": [0.2, 0.2, 0], "center": [0, 0, 0]}]}
    res = client.post('/mesher', json={'spec': spec, 'options': {'density': 1}})
    assert res.status_code == 200
    data = res.json()
    assert data['triangles'] >= 1
    assert 'mesh' in data


def test_mesher_with_polygon():
    app = create_app()
    client = TestClient(app)
    spec = {"geometry": [{"shape": "polygon", "points": [[0,0],[1,0],[1,1],[0,1]]}]}
    res = client.post('/mesher', json={'spec': spec})
    assert res.status_code == 200
    data = res.json()
    assert data['triangles'] == 2
