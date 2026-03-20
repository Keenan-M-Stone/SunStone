#!/usr/bin/env bash
set -euo pipefail

echo "== Environment check =="

echo -n "Python: " && python3 -V 2>/dev/null || python -V

if command -v node >/dev/null 2>&1; then
  echo -n "Node: " && node -v
else
  echo "Node: missing"
fi
if command -v npm >/dev/null 2>&1; then
  echo -n "npm: " && npm -v
else
  echo "npm: missing"
fi

python3 - <<'PY'
for m in ('numpy', 'pytest', 'pydantic', 'fastapi', 'uvicorn'):
    try:
        __import__(m)
        print(f"{m}: ok")
    except Exception:
        print(f"{m}: missing")
PY

echo "== End env check =="
