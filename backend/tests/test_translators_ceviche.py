import json
from pathlib import Path

from sunstone_backend.translators.ceviche import translate_spec_to_ceviche


EX = Path(__file__).parent / "examples" / "ceviche.json"


def test_translate_ceviche_example():
    spec = json.loads(EX.read_text())
    out = translate_spec_to_ceviche(spec)
    parsed = json.loads(out)
    assert parsed["backend"] == "ceviche"
    assert "geometry" in parsed
    assert isinstance(parsed["geometry"], list)
    assert parsed["meta"]["translated_by"].startswith("sunstone-ceviche-translator")
