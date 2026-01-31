from sunstone_backend.translators.ceviche import translate_spec_to_ceviche
import json


def test_translator_normalizes_materials_list_to_mapping():
    spec = {
        "domain": {"dimension": "2d", "cell_size": [1.0, 1.0, 0.0], "resolution": 20},
        "geometry": [],
        "materials": [
            {"name": "vac", "type": "isotropic", "epsilon": 1.0},
            {"name": "meta", "type": "anisotropic", "eps": {"real": 2.0, "imag": -0.1}},
        ],
    }
    payload = translate_spec_to_ceviche(spec)
    obj = json.loads(payload)
    assert isinstance(obj.get("materials"), dict)
    assert "vac" in obj["materials"]
    assert "meta" in obj["materials"]
    # complex eps preserved
    assert obj["materials"]["meta"].get("eps") == {"real": 2.0, "imag": -0.1}
