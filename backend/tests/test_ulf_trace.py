from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app


def test_ulf_trace_simple():
    app = create_app()
    client = TestClient(app)
    body = {
        "objects": [],
        "sources": [{"kind": "point", "position": {"x": 0.0, "y": 0.0, "z": 0.0}, "direction": {"x": 1.0, "y": 0.0, "z": 0.0}}],
        "samples": 10,
    }
    res = client.post('/ulf/trace', json=body)
    assert res.status_code == 200
    data = res.json()
    assert 'id' in data
    assert 'traces' in data
    assert isinstance(data['traces'], list)
    assert len(data['traces']) == 1
    assert len(data['traces'][0]['points']) == 10
