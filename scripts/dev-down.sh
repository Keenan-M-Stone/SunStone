#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.sunstone"
DEV_DIR="$DATA_DIR/dev"
PID_DIR="$DEV_DIR/pids"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
FRONTEND_PORT_FILE="$DEV_DIR/frontend.port"

stop_pid_file() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name not running (no pid file)"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" || true)"

  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    echo "$name not running (empty pid file)"
    return 0
  fi

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$pid_file"
    echo "$name not running (stale pid $pid)"
    return 0
  fi

  echo "Stopping $name (pid $pid)…"
  kill -TERM "$pid" >/dev/null 2>&1 || true

  # Wait up to ~5 seconds
  for _ in {1..25}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$pid_file"
      echo "$name stopped"
      return 0
    fi
    sleep 0.2
  done

  echo "$name still running; killing (pid $pid)…" >&2
  kill -KILL "$pid" >/dev/null 2>&1 || true
  rm -f "$pid_file"
  echo "$name killed"
}

mkdir -p "$PID_DIR" >/dev/null 2>&1 || true

stop_pid_file "Frontend" "$FRONTEND_PID_FILE"
stop_pid_file "Backend" "$BACKEND_PID_FILE"

rm -f "$FRONTEND_PORT_FILE" >/dev/null 2>&1 || true
