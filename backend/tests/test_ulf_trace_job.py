import time
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app


def test_ulf_trace_job_flow(tmp_path):
    # Override settings data_dir via env patching if needed
    app = create_app()
    client = TestClient(app)
    body = {
        "objects": [{"id": "bh1", "kind": "schwarzschild", "params": {"M": 0.01}, "center": {"x": 0.0, "y": 0.0, "z": 0.0}}],
        "sources": [{"kind": "point", "position": {"x": -10.0, "y": 1.0, "z": 0.0}, "direction": {"x": 1.0, "y": 0.0, "z": 0.0}}],
        "samples": 30,
        "model": "schwarzschild"
    }

    res = client.post('/ulf/trace_job', json=body)
    assert res.status_code == 200
    data = res.json()
    assert 'job_id' in data
    job_id = data['job_id']

    # Poll for completion (fast in test env)
    for _ in range(20):
        r = client.get(f'/ulf/trace_job/{job_id}')
        assert r.status_code == 200
        info = r.json()
        if info.get('status') == 'done':
            result = info.get('result')
            assert result and 'traces' in result
            assert len(result['traces'][0]['points']) == 30
            assert len(result['traces'][0]['metric_samples']) == 30
            return
        time.sleep(0.1)
    assert False, 'job did not finish in time'