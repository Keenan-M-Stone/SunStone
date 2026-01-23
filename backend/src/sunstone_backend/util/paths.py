from __future__ import annotations

from pathlib import Path


def safe_join(root: Path, rel: str) -> Path:
    """Join `root` + `rel` while preventing path traversal."""
    candidate = (root / rel).resolve()
    root_resolved = root.resolve()
    if root_resolved == candidate or root_resolved in candidate.parents:
        return candidate
    raise ValueError("illegal path")
