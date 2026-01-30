from __future__ import annotations

import json
from typing import Any


def translate_spec_to_opal(spec: dict[str, Any]) -> str:
    """Produce a conservative Opal input preview from a SunStone spec.

    Returns a small textual representation suitable for previewing in the UI.
    """
    domain = spec.get("domain", {})
    geom_count = len(spec.get("geometry", []) or [])
    return f"# Opal translator stub\n# domain: {domain}\n# geometry_items: {geom_count}\n"


__all__ = ["translate_spec_to_opal"]
