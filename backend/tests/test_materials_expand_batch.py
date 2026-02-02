from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app

client = TestClient(create_app())


def test_expand_gradient_batch_simple():
    items = [
        {
            'key': 'g1',
            'material': {'eps': 1.0, 'gradient': {'type': 'linear', 'start': [0,0,0], 'end': [1,0,0], 'value0': 1.0, 'value1': 2.0}},
            'geometry': {'type': 'block', 'size': [1.0, 1.0, 0.1], 'center': [0,0,0]},
            'slices': 4,
            'axis': 'x'
        }
    ]
    res = client.post('/materials/expand_gradient_batch', json={'items': items})
    assert res.status_code == 200
    data = res.json()
    assert 'results' in data
    assert 'g1' in data['results']
    assert isinstance(data['results']['g1'], list)
    assert len(data['results']['g1']) == 4
