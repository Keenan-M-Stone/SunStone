from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app


def test_ulf_trace_schwarzschild_samples():
    app = create_app()
    client = TestClient(app)
    body = {
        "objects": [{"id": "bh1", "kind": "schwarzschild", "params": {"M": 0.01}, "center": {"x": 0.0, "y": 0.0, "z": 0.0}}],
        "sources": [{"kind": "point", "position": {"x": -10.0, "y": 1.0, "z": 0.0}, "direction": {"x": 1.0, "y": 0.0, "z": 0.0}}],
        "samples": 50,
        "model": "schwarzschild"
    }
    res = client.post('/ulf/trace', json=body)
    assert res.status_code == 200
    data = res.json()
    assert 'id' in data
    assert 'traces' in data
    assert isinstance(data['traces'], list)
    assert len(data['traces']) == 1
    tr = data['traces'][0]
    assert 'points' in tr
    assert 'metric_samples' in tr
    assert len(tr['points']) == 50
    assert len(tr['metric_samples']) == 50
    # eps should appear in metric samples and be a 3x3 diag-ish matrix
    eps0 = tr['metric_samples'][0]['eps']
    assert len(eps0) == 3
    assert all(len(row) == 3 for row in eps0)
    # values should be finite and positive
    assert all(isinstance(val, (int, float)) for row in eps0 for val in row)
