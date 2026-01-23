#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.sunstone"
DEV_DIR="$DATA_DIR/dev"
PID_DIR="$DEV_DIR/pids"
LOG_DIR="$DEV_DIR/logs"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
FRONTEND_PORT_FILE="$DEV_DIR/frontend.port"

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

show_one() {
  local name="$1"
  local pid_file="$2"
  local url="$3"
  local log_file="$4"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name: down (no pid file)"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" || true)"

  if is_pid_running "$pid"; then
    echo "$name: up (pid $pid) -> $url"
    echo "  log: $log_file"
  else
    echo "$name: down (stale pid $pid)"
    echo "  log: $log_file"
  fi
}

mkdir -p "$PID_DIR" "$LOG_DIR" >/dev/null 2>&1 || true

show_one "Backend" "$BACKEND_PID_FILE" "http://127.0.0.1:8000" "$BACKEND_LOG"
FRONTEND_PORT="5173"
if [[ -f "$FRONTEND_PORT_FILE" ]]; then
  FRONTEND_PORT="$(cat "$FRONTEND_PORT_FILE" || echo "5173")"
fi
show_one "Frontend" "$FRONTEND_PID_FILE" "http://127.0.0.1:${FRONTEND_PORT}" "$FRONTEND_LOG"
