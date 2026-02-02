from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
from sunstone_backend.settings import get_settings

import json
import tempfile
import shutil


def test_create_and_get_material(tmp_path):
    # Use a temporary data_dir for isolation
    settings = get_settings()
    orig_data_dir = settings.data_dir
    settings.data_dir = tmp_path

    app = create_app()
    client = TestClient(app)

    body = {"label": "ulf_test_material", "eps": [[1,0,0],[0,1,0],[0,0,1]], "mu": [[1,0,0],[0,1,0],[0,0,1]]}
    r = client.post("/materials", json=body)
    assert r.status_code == 201
    data = r.json()
    assert "id" in data
    mid = data["id"]

    # GET it back
    g = client.get(f"/materials/{mid}")
    assert g.status_code == 200
    got = g.json()
    assert got["id"] == mid
    assert got["label"] == "ulf_test_material"

    # restore
    settings.data_dir = orig_data_dir
