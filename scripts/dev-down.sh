#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.sunstone"
DEV_DIR="$DATA_DIR/dev"
PID_DIR="$DEV_DIR/pids"

BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
FRONTEND_PORT_FILE="$DEV_DIR/frontend.port"

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

stop_pid_direct() {
  local name="$1"
  local pid="$2"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi
  echo "Stopping $name (pid $pid)…"
  kill -TERM "$pid" >/dev/null 2>&1 || true
  for _ in {1..25}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "$name stopped"
      return 0
    fi
    sleep 0.2
  done
  echo "$name still running; killing (pid $pid)…" >&2
  kill -KILL "$pid" >/dev/null 2>&1 || true
}

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

# Fallback for stale listeners if pid files were lost.
backend_listener_pid="$(find_listener_pid 8000)"
if [[ -n "$backend_listener_pid" ]] && kill -0 "$backend_listener_pid" >/dev/null 2>&1; then
  if cmdline_contains "$backend_listener_pid" "uvicorn" && cmdline_contains "$backend_listener_pid" "sunstone_backend.api.app:create_app"; then
    stop_pid_direct "Backend listener" "$backend_listener_pid"
  fi
fi

frontend_port="5173"
if [[ -f "$FRONTEND_PORT_FILE" ]]; then
  frontend_port="$(cat "$FRONTEND_PORT_FILE" || echo 5173)"
fi
frontend_listener_pid="$(find_listener_pid "$frontend_port")"
if [[ -n "$frontend_listener_pid" ]] && kill -0 "$frontend_listener_pid" >/dev/null 2>&1; then
  if cwd_starts_with "$frontend_listener_pid" "$ROOT_DIR/frontend" || cmdline_contains "$frontend_listener_pid" "vite"; then
    stop_pid_direct "Frontend listener" "$frontend_listener_pid"
  fi
fi
