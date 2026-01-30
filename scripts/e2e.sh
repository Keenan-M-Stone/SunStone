#!/usr/bin/env bash
set -euo pipefail

# Start backend and frontend, run Playwright E2E tests, then tear down
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

echo "Starting backend (dev-up.sh)"
./scripts/dev-up.sh
# Ensure dev-down runs on exit
cleanup() {
  echo "Tearing down backend"
  "$ROOT_DIR/scripts/dev-down.sh" || true
}
trap cleanup EXIT

# Start the frontend dev server in background
echo "Starting frontend (npm run dev)"
cd frontend
# Force consistent dev port for tests
VITE_PORT=5173 VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev > /tmp/sunstone-frontend.log 2>&1 &
FRONT_PID=$!
cd ..

# Export base URL for Playwright
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173

echo "Waiting for frontend to be ready..."
# Wait for vite to be reachable (port from PLAYWRIGHT_BASE_URL)
RETRIES=0
until curl -sSf "$PLAYWRIGHT_BASE_URL/" >/dev/null 2>&1 || [ $RETRIES -ge 30 ]; do
  sleep 1
  RETRIES=$((RETRIES+1))
done
if [ $RETRIES -ge 30 ]; then
  echo "Frontend did not start in time, showing last logs:" >&2
  tail -n +1 /tmp/sunstone-frontend.log >&2
  exit 1
fi

# Run Playwright tests (this will start Playwright runner which will use the dev server)
cd frontend
npx playwright test --config=playwright.config.ts

# If we reach here, success will trigger cleanup via trap
