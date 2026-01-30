from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app


def test_list_backends_and_capabilities():
    app = create_app()
    client = TestClient(app)

    res = client.get('/backends')
    assert res.status_code == 200
    data = res.json()
    assert any(b['name'] == 'ceviche' for b in data)

    res2 = client.get('/backends/ceviche')
    assert res2.status_code == 200
    caps = res2.json()
    assert caps['name'] == 'ceviche'
    assert 'capabilities' in caps
    assert 'resolution' in caps['capabilities']
