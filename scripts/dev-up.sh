#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.sunstone"
DEV_DIR="$DATA_DIR/dev"
PID_DIR="$DEV_DIR/pids"
LOG_DIR="$DEV_DIR/logs"

BACKEND_PORT="${SUNSTONE_BACKEND_PORT:-8000}"
FRONTEND_PORT="${SUNSTONE_FRONTEND_PORT:-5173}"
CONDA_ENV_NAME="${SUNSTONE_CONDA_ENV:-sunstone}"
BACKEND_PYTHON_OVERRIDE="${SUNSTONE_BACKEND_PYTHON:-}"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
FRONTEND_PORT_FILE="$DEV_DIR/frontend.port"

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

mkdir -p "$PID_DIR" "$LOG_DIR" "$DATA_DIR"

OSRELEASE=""
if [[ -r /proc/sys/kernel/osrelease ]]; then
  OSRELEASE="$(cat /proc/sys/kernel/osrelease)"
fi
IS_WSL=0
if echo "$OSRELEASE" | grep -qiE "microsoft|wsl"; then
  IS_WSL=1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

find_listener_pid() {
  local port="$1"
  local line
  line="$(ss -ltnp 2>/dev/null | grep ":$port" | head -n 1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return 0
  fi
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

cwd_starts_with() {
  local pid="$1"
  local prefix="$2"
  local cwd
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  [[ -n "$cwd" ]] && [[ "$cwd" == "$prefix"* ]]
}

http_ok() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -sf "$url" >/dev/null 2>&1
    return $?
  fi
  python3 - <<'PY' "$url" >/dev/null 2>&1
import sys, urllib.request
try:
    with urllib.request.urlopen(sys.argv[1], timeout=1.0):
        sys.exit(0)
except Exception:
    sys.exit(1)
PY
}

open_url() {
  local url="$1"

  if [[ "${SUNSTONE_NO_OPEN:-}" == "1" ]]; then
    return 0
  fi

  if [[ "$IS_WSL" == "1" ]] && command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$url" >/dev/null 2>&1 &
    return 0
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

pick_backend_python() {
  if [[ -n "$BACKEND_PYTHON_OVERRIDE" && -x "$BACKEND_PYTHON_OVERRIDE" ]]; then
    echo "$BACKEND_PYTHON_OVERRIDE"
    return 0
  fi

  if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
    echo "$ROOT_DIR/.venv/bin/python"
    return 0
  fi

  if [[ -n "${VIRTUAL_ENV:-}" && -x "$VIRTUAL_ENV/bin/python" ]]; then
    echo "$VIRTUAL_ENV/bin/python"
    return 0
  fi

  if command -v conda >/dev/null 2>&1; then
    # shellcheck disable=SC1091
    source "$(conda info --base)/etc/profile.d/conda.sh" || true
    if conda env list | awk '{print $1}' | grep -Fxq "$CONDA_ENV_NAME"; then
      conda activate "$CONDA_ENV_NAME" >/dev/null 2>&1 || true
      if command -v python >/dev/null 2>&1; then
        command -v python
        return 0
      fi
    fi
  fi

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi

  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi

  return 1
}

wait_for_process_http() {
  local pid="$1"
  local url="$2"
  local log_file="$3"
  local label="$4"

  for _ in {1..40}; do
    if ! is_pid_running "$pid"; then
      echo "$label exited during startup. Last log lines:" >&2
      tail -n 60 "$log_file" >&2 || true
      return 1
    fi
    if http_ok "$url"; then
      return 0
    fi
    sleep 0.25
  done

  echo "$label did not become responsive at $url. Last log lines:" >&2
  tail -n 60 "$log_file" >&2 || true
  return 1
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

  local listener_pid
  listener_pid="$(find_listener_pid "$BACKEND_PORT")"
  if [[ -n "$listener_pid" ]] && is_pid_running "$listener_pid"; then
    if cmdline_contains "$listener_pid" "uvicorn" && cmdline_contains "$listener_pid" "sunstone_backend.api.app:create_app"; then
      echo "$listener_pid" >"$BACKEND_PID_FILE"
      echo "Backend already running on :$BACKEND_PORT (adopted pid $listener_pid)"
      return 0
    fi

    echo "Port $BACKEND_PORT is already in use by pid $listener_pid; backend not started." >&2
    echo "Run ./scripts/dev-down.sh or stop pid $listener_pid, then retry." >&2
    return 1
  fi

  local backend_python
  backend_python="$(pick_backend_python)" || {
    echo "No suitable Python interpreter found for backend." >&2
    return 1
  }

  export SUNSTONE_DATA_DIR="$DATA_DIR"
  cd "$ROOT_DIR/backend"

  "$backend_python" -c "import sunstone_backend, uvicorn" >/dev/null 2>&1 || {
    echo "Backend environment is missing SunStone backend dependencies." >&2
    echo "Using interpreter: $backend_python" >&2
    echo "Run: cd $ROOT_DIR/backend && $backend_python -m pip install -e ." >&2
    return 1
  }

  local backend_host="127.0.0.1"
  local backend_url_host="127.0.0.1"
  if [[ "$IS_WSL" == "1" ]]; then
    backend_host="0.0.0.0"
  fi

  nohup "$backend_python" -m uvicorn sunstone_backend.api.app:create_app \
    --factory \
    --host "$backend_host" \
    --port "$BACKEND_PORT" \
    >"$BACKEND_LOG" 2>&1 &

  local pid="$!"
  echo "$pid" >"$BACKEND_PID_FILE"
  if ! wait_for_process_http "$pid" "http://$backend_url_host:$BACKEND_PORT/docs" "$BACKEND_LOG" "Backend"; then
    rm -f "$BACKEND_PID_FILE"
    return 1
  fi

  echo "Backend started (pid $pid)"
  echo "Backend log: $BACKEND_LOG"
}

start_frontend() {
  if [[ -f "$FRONTEND_PID_FILE" ]]; then
    local pid
    pid="$(cat "$FRONTEND_PID_FILE" || true)"
    if is_pid_running "$pid"; then
      echo "Frontend already running (pid $pid)"
      echo "$FRONTEND_PORT" >"$FRONTEND_PORT_FILE"
      return 0
    fi
  fi

  local listener_pid
  listener_pid="$(find_listener_pid "$FRONTEND_PORT")"
  if [[ -n "$listener_pid" ]] && is_pid_running "$listener_pid"; then
    if cwd_starts_with "$listener_pid" "$ROOT_DIR/frontend" || cmdline_contains "$listener_pid" "vite"; then
      echo "$listener_pid" >"$FRONTEND_PID_FILE"
      echo "$FRONTEND_PORT" >"$FRONTEND_PORT_FILE"
      echo "Frontend already running on :$FRONTEND_PORT (adopted pid $listener_pid)"
      return 0
    fi

    echo "Port $FRONTEND_PORT is already in use by pid $listener_pid; frontend not started." >&2
    return 1
  fi

  require_cmd npm
  cd "$ROOT_DIR/frontend"

  if [[ "$IS_WSL" == "1" ]]; then
    export VITE_API_BASE_URL="http://localhost:$BACKEND_PORT"
  else
    export VITE_API_BASE_URL="http://127.0.0.1:$BACKEND_PORT"
  fi

  if [[ ! -d node_modules ]]; then
    echo "Installing frontend deps (node_modules missing)…"
    npm install
  fi

  nohup npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" >"$FRONTEND_LOG" 2>&1 &

  local pid="$!"
  echo "$pid" >"$FRONTEND_PID_FILE"
  echo "$FRONTEND_PORT" >"$FRONTEND_PORT_FILE"
  if ! wait_for_process_http "$pid" "http://127.0.0.1:$FRONTEND_PORT" "$FRONTEND_LOG" "Frontend"; then
    rm -f "$FRONTEND_PID_FILE" "$FRONTEND_PORT_FILE"
    return 1
  fi

  echo "Frontend started (pid $pid)"
  echo "Frontend log: $FRONTEND_LOG"
}

backend_ok=1
if ! start_backend; then
  backend_ok=0
fi
frontend_ok=1
if ! start_frontend; then
  frontend_ok=0
fi

echo "UI:      http://127.0.0.1:${FRONTEND_PORT}"
if [[ "$backend_ok" == "1" ]]; then
  echo "API:     http://127.0.0.1:${BACKEND_PORT}"
  echo "API docs http://127.0.0.1:${BACKEND_PORT}/docs"
else
  echo "API:     (not running)"
fi

if [[ "$frontend_ok" == "1" ]]; then
  open_url "http://127.0.0.1:${FRONTEND_PORT}"
else
  echo "Frontend may not be running. Open this URL manually: http://127.0.0.1:${FRONTEND_PORT}"
fi
