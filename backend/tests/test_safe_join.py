from __future__ import annotations

from pathlib import Path

import pytest

from sunstone_backend.util.paths import safe_join


def test_safe_join_allows_relative(tmp_path: Path) -> None:
    root = tmp_path / "root"
    root.mkdir()
    p = safe_join(root, "outputs/summary.json")
    assert str(p).startswith(str(root.resolve()))


def test_safe_join_blocks_traversal(tmp_path: Path) -> None:
    root = tmp_path / "root"
    root.mkdir()
    with pytest.raises(ValueError):
        safe_join(root, "../secrets.txt")
