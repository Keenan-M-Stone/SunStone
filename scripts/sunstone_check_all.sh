#!/usr/bin/env bash
# Run all SunStone backend/frontend diagnostics
set -e

cd "$(dirname "$0")/.."

PYTHON=python
if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
fi

$PYTHON scripts/sunstone_backend_diag.py
$PYTHON scripts/sunstone_fullstack_diag.py

echo "All SunStone diagnostics complete."
