from fastapi.testclient import TestClient
from sunstone_backend.api.app import create_app
import io

app = create_app()
client = TestClient(app)


def test_upload_and_qc_obj(tmp_path):
    content = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
    files = {'mesh': ('tri.obj', content, 'text/plain')}
    res = client.post('/meshes', files=files)
    assert res.status_code == 200
    data = res.json()
    mid = data['id']

    meta = client.get(f'/meshes/{mid}')
    assert meta.status_code == 200
    qc = client.get(f'/meshes/{mid}/qc')
    assert qc.status_code == 200
    j = qc.json()
    assert j['qc']['vertices'] == 3
    assert j['qc']['faces'] == 1
