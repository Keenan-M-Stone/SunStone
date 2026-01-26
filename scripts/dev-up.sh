#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.sunstone"
DEV_DIR="$DATA_DIR/dev"
PID_DIR="$DEV_DIR/pids"
LOG_DIR="$DEV_DIR/logs"

OSRELEASE=""
if [[ -r /proc/sys/kernel/osrelease ]]; then
  OSRELEASE="$(cat /proc/sys/kernel/osrelease)"
fi
IS_WSL=0
if echo "$OSRELEASE" | grep -qiE "microsoft|wsl"; then
  IS_WSL=1
fi

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
FRONTEND_PORT_FILE="$DEV_DIR/frontend.port"

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

mkdir -p "$PID_DIR" "$LOG_DIR" "$DATA_DIR"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

open_url() {
  local url="$1"

  if [[ "${SUNSTONE_NO_OPEN:-}" == "1" ]]; then
    return 0
  fi

  if [[ "$IS_WSL" == "1" ]]; then
    if command -v cmd.exe >/dev/null 2>&1; then
      cmd.exe /c start "" "$url" >/dev/null 2>&1 &
      return 0
    fi
  fi

  if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" && "$(uname -s)" != "Darwin" ]]; then
    echo "No GUI session detected. Open this URL manually: $url"
    return 0
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    nohup xdg-open "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    nohup open "$url" >/dev/null 2>&1 &
  elif command -v python3 >/dev/null 2>&1; then
    nohup python3 -m webbrowser "$url" >/dev/null 2>&1 &
  else
    echo "No browser opener found. Open this URL manually: $url"
  fi
}

find_listener_pid() {
  local port="$1"
  local line
  line="$(ss -ltnp 2>/dev/null | grep ":$port" | head -n 1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return 0
  fi
  # Try to extract pid=1234 from ss output.
  echo "$line" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1
}

cmdline_contains() {
  local pid="$1"
  local needle="$2"
  if [[ ! -r "/proc/$pid/cmdline" ]]; then
    return 1
  fi
  tr '\0' ' ' <"/proc/$pid/cmdline" | grep -Fq -- "$needle"
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

extract_frontend_port() {
  if [[ ! -f "$FRONTEND_LOG" ]]; then
    echo ""
    return 0
  fi

  grep -Eo 'http://127\.0\.0\.1:[0-9]+' "$FRONTEND_LOG" | tail -n 1 | sed 's/.*://'
}

start_backend() {
  if [[ -f "$BACKEND_PID_FILE" ]]; then
    local pid
    pid="$(cat "$BACKEND_PID_FILE" || true)"
    if is_pid_running "$pid"; then
      echo "Backend already running (pid $pid)"
      return 0
    fi
  fi

  # If something is already listening on 8000, adopt it if it looks like our uvicorn.
  local listener_pid
  listener_pid="$(find_listener_pid 8000)"
  if [[ -n "$listener_pid" ]] && is_pid_running "$listener_pid"; then
    if cmdline_contains "$listener_pid" "uvicorn" && cmdline_contains "$listener_pid" "sunstone_backend.api.app:create_app"; then
      echo "$listener_pid" >"$BACKEND_PID_FILE"
      echo "Backend already running on :8000 (adopted pid $listener_pid)"
      return 0
    fi

    echo "Port 8000 is already in use by pid $listener_pid; backend not started." >&2
    echo "Run ./scripts/dev-down.sh or stop pid $listener_pid, then retry." >&2
    return 1
  fi

  if ! command -v conda >/dev/null 2>&1; then
    echo "Missing required command: conda" >&2
    return 1
  fi

  # Activate conda env in this shell so we get a real uvicorn pid.
  # shellcheck disable=SC1090
  source "$(conda info --base)/etc/profile.d/conda.sh"
  conda activate sunstone

  export SUNSTONE_DATA_DIR="$DATA_DIR"

  cd "$ROOT_DIR/backend"

  # Quick sanity check so failures are obvious.
  python -c "import sunstone_backend" >/dev/null 2>&1 || {
    echo "Backend package not installed in env 'sunstone'." >&2
    echo "Run: cd $ROOT_DIR/backend && pip install -e ." >&2
    return 1
  }

  local backend_host="127.0.0.1"
  if [[ "$IS_WSL" == "1" ]]; then
    backend_host="0.0.0.0"
  fi

  nohup uvicorn sunstone_backend.api.app:create_app \
    --factory \
    --host "$backend_host" \
    --port 8000 \
    >"$BACKEND_LOG" 2>&1 &

  echo "$!" >"$BACKEND_PID_FILE"
  echo "Backend started (pid $(cat "$BACKEND_PID_FILE"))"
  echo "Backend log: $BACKEND_LOG"
}

start_frontend() {
  if [[ -f "$FRONTEND_PID_FILE" ]]; then
    local pid
    pid="$(cat "$FRONTEND_PID_FILE" || true)"
    if is_pid_running "$pid"; then
      echo "Frontend already running (pid $pid)"
      return 0
    fi
  fi

  require_cmd npm

  cd "$ROOT_DIR/frontend"

  if [[ "$IS_WSL" == "1" ]]; then
    export VITE_API_BASE_URL="http://localhost:8000"
  else
    export VITE_API_BASE_URL="http://127.0.0.1:8000"
  fi

  if [[ ! -d node_modules ]]; then
    echo "Installing frontend deps (node_modules missing)…"
    npm install
  fi

  nohup npm run dev -- --host 127.0.0.1 --port 5173 >"$FRONTEND_LOG" 2>&1 &

  echo "$!" >"$FRONTEND_PID_FILE"
  echo "Frontend started (pid $(cat "$FRONTEND_PID_FILE"))"
  echo "Frontend log: $FRONTEND_LOG"

  local port=""
  for _ in {1..50}; do
    port="$(extract_frontend_port)"
    if [[ -n "$port" ]]; then
      echo "$port" >"$FRONTEND_PORT_FILE"
      break
    fi
    sleep 0.1
  done
}

backend_ok=1
if ! start_backend; then
  backend_ok=0
fi
frontend_ok=1
if ! start_frontend; then
  frontend_ok=0
fi

FRONTEND_PORT="5173"
if [[ -f "$FRONTEND_PORT_FILE" ]]; then
  FRONTEND_PORT="$(cat "$FRONTEND_PORT_FILE" || echo "5173")"
fi

echo "UI:      http://127.0.0.1:${FRONTEND_PORT}"
if [[ "$backend_ok" == "1" ]]; then
  echo "API:     http://127.0.0.1:8000"
  echo "API docs http://127.0.0.1:8000/docs"
else
  echo "API:     (not running)"
fi

if [[ "$frontend_ok" == "1" ]]; then
  open_url "http://127.0.0.1:${FRONTEND_PORT}"
else
  echo "Frontend may not be running. Open this URL manually: http://127.0.0.1:${FRONTEND_PORT}"
fi
