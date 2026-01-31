from __future__ import annotations

from typing import Any


def normalize_materials(materials_raw: Any) -> dict:
    """Normalize materials into a mapping name -> info dict.

    Accepts either a dict mapping or a list of material dicts used by older
    bundle formats. This function NORMALIZES names only and canonicalizes
    common key names ("type" -> "model", "epsilon" -> "eps") but
    otherwise makes no structural changes to the info dict values.
    The function is explicitly non-destructive: it does NOT coerce numeric
    values or parse complex/tensor structures; those remain as provided so
    backends can implement appropriate parsing/handling.
    """
    if isinstance(materials_raw, list):
        materials: dict[str, dict] = {}
        for m in materials_raw:
            if not isinstance(m, dict):
                continue
            name = str(m.get("name") or m.get("id") or "").strip()
            if not name:
                continue
            info = dict(m)  # shallow copy
            # normalize commonly-used key names without coercion
            if "type" in info and "model" not in info:
                info["model"] = info.get("type")
            if "epsilon" in info and "eps" not in info:
                info["eps"] = info.get("epsilon")
            materials[name] = info
        return materials
    if isinstance(materials_raw, dict):
        return materials_raw
    return {}


# Parsing helpers for backend-specific interpretation
def parse_epsilon_for_meep(info: dict):
    """Interpret material info and return an object usable by Meep.

    Supported forms:
    - scalar eps: number (int/float) -> return float
    - complex scalar: {'real':..., 'imag':...} or string 'a+bj' -> complex
    - tensor: 'eps_tensor': [[...]] -> if diagonal, return ('diag', (ex,ey,ez))

    Raises ValueError for unsupported or malformed structures.
    """
    if not isinstance(info, dict):
        raise ValueError("material info must be a dict")

    # Direct scalar
    eps = info.get("eps")
    if isinstance(eps, (int, float)):
        return float(eps)

    # Complex scalar encoded as dict
    if isinstance(eps, dict) and "real" in eps and "imag" in eps:
        try:
            real = float(eps.get("real", 0.0))
            imag = float(eps.get("imag", 0.0))
            return complex(real, imag)
        except Exception:
            raise ValueError("Invalid complex epsilon dict")

    # Complex scalar encoded as string
    if isinstance(eps, str):
        try:
            return complex(eps)
        except Exception:
            raise ValueError("Invalid complex epsilon string")

    # Diagonal tensor
    tensor = info.get("eps_tensor") or info.get("epsilon_tensor")
    if tensor is not None:
        if isinstance(tensor, list) and len(tensor) == 3 and all(isinstance(r, list) and len(r) == 3 for r in tensor):
            # check diagonal
            ex = tensor[0][0]
            ey = tensor[1][1]
            ez = tensor[2][2]
            off_diag = sum(abs(tensor[i][j]) for i in range(3) for j in range(3) if i != j)
            if off_diag != 0:
                raise ValueError("Non-diagonal eps_tensor not supported by Meep parser")
            return ("diag", (float(ex), float(ey), float(ez)))
        else:
            raise ValueError("Malformed eps_tensor; expected 3x3 nested lists")

    # Last resort: try to coerce numeric-like eps if present under other keys
    if isinstance(eps, (int, float)):
        return float(eps)

    # No supported epsilon found: return default 1.0
    return 1.0
