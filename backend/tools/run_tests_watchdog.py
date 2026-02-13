#!/usr/bin/env python3

"""Run SunStone backend pytest with overall and per-test watchdog timeouts.

Per-test timeouts are configured via pyproject.toml (pytest-timeout plugin).
This script adds an overall wall-clock timeout to prevent the whole suite from
running forever in case of deadlocks or runaway parameterization.

Usage:
  # from SunStone/backend
  python tools/run_tests_watchdog.py
  SUNSTONE_TEST_TIMEOUT_S=600 python tools/run_tests_watchdog.py -k "not slow"

Env:
  SUNSTONE_TEST_TIMEOUT_S (default 1200)
"""

from __future__ import annotations

import os
import subprocess
import sys
import time


def main() -> int:
  overall_timeout_s = int(os.environ.get("SUNSTONE_TEST_TIMEOUT_S", "1200"))
  start = time.time()
  cmd = [sys.executable, "-m", "pytest", *sys.argv[1:]]
  print("Running:", " ".join(cmd))
  print(f"Overall timeout: {overall_timeout_s}s")

  proc = subprocess.Popen(cmd)
  try:
    while True:
      rc = proc.poll()
      if rc is not None:
        return int(rc)
      if (time.time() - start) > overall_timeout_s:
        print("\nERROR: pytest exceeded overall timeout; terminating...", file=sys.stderr)
        proc.terminate()
        try:
          proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
          print("Force killing pytest...", file=sys.stderr)
          proc.kill()
        return 124
      time.sleep(0.5)
  except KeyboardInterrupt:
    proc.terminate()
    return 130


if __name__ == "__main__":
  raise SystemExit(main())
