import json
from pathlib import Path
from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app


def test_translate_ceviche_endpoint():
    app = create_app()
    client = TestClient(app)

    ex = Path(__file__).parent / "examples" / "ceviche.json"
    spec = json.loads(ex.read_text())

    res = client.post('/backends/ceviche/translate', json=spec)
    assert res.status_code == 200
    data = res.json()
    assert data['backend'] == 'ceviche'
    assert 'translated' in data
    assert isinstance(data['translated'], dict)
    assert data['translated'].get('backend') == 'ceviche'


def test_translate_opal_endpoint():
    app = create_app()
    client = TestClient(app)
    ex = Path(__file__).parent / "examples" / "opal.json"
    spec = json.loads(ex.read_text())
    res = client.post('/backends/opal/translate', json=spec)
    assert res.status_code == 200
    data = res.json()
    assert data['backend'] == 'opal'
    # Translator may return a textual preview or a structured payload; accept either
    assert isinstance(data['translated'], (str, dict))


def test_translate_missing_backend():
    app = create_app()
    client = TestClient(app)
    res = client.post('/backends/foosolver/translate', json={})
    assert res.status_code == 404
