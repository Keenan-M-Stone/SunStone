from pathlib import Path


def test_examples_exist():
    base = Path(__file__).parent / "examples"
    names = ["ceviche.json", "opal.json", "scuffem.json", "pygdm.json", "meep.json"]
    for n in names:
        assert (base / n).exists(), f"Missing example: {n}"
