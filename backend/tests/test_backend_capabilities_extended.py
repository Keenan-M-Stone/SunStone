from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app

app = create_app()
client = TestClient(app)


def test_backend_capabilities_include_new_keys():
    res = client.get('/backends/meep')
    assert res.status_code == 200
    data = res.json()
    assert 'boundary_types' in data
    assert 'material_models' in data
    assert 'source_types' in data
    assert 'schemas' in data


def test_submit_run_rejects_unsupported_material_type(tmp_path):
    # Create a project and run, then attempt to submit with unsupported material type
    proj_res = client.post('/projects', json={'name': 'test'})
    assert proj_res.status_code == 200
    proj = proj_res.json()
    spec = {'domain': {'cell_size': [1.0,1.0,0], 'resolution': 10}, 'materials': [{'name':'m1','epsilon':2.0,'type': 'weird_model'}]}
    create_run_res = client.post(f"/projects/{proj['id']}/runs", json={'spec': spec})
    assert create_run_res.status_code == 200
    run = create_run_res.json()
    # Submit without changing backend (default is meep in settings), expecting validation error
    sub = client.post(f"/runs/{run['id']}/submit", json={'mode': 'local', 'backend': 'meep'})
    assert sub.status_code == 400
    assert 'not supported' in sub.text


def test_submit_run_accepts_supported_material(tmp_path):
    proj_res = client.post('/projects', json={'name': 'test2'})
    proj = proj_res.json()
    spec = {'domain': {'cell_size': [1.0,1.0,0], 'resolution': 10}, 'materials': [{'name':'m1','epsilon':2.0,'type': 'isotropic'}]}
    create_run_res = client.post(f"/projects/{proj['id']}/runs", json={'spec': spec})
    run = create_run_res.json()
    sub = client.post(f"/runs/{run['id']}/submit", json={'mode': 'local', 'backend': 'meep'})
    # Depending on environment, local submit may succeed or not; we only assert it doesn't return 400 validation
    assert sub.status_code != 400


def test_schema_endpoint_serves_boundary():
    res = client.get('/schemas/boundary')
    assert res.status_code == 200
    data = res.json()
    assert data.get('title') == 'BoundaryCondition'
