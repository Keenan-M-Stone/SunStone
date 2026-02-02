#!/usr/bin/env python3
"""Run vulture and filter results using a whitelist file.
Exits with non-zero if any un-whitelisted findings remain.
"""
import subprocess
import sys
from pathlib import Path

WHITELIST = Path(__file__).parent / "vulture-whitelist.txt"

if not WHITELIST.exists():
    print("Whitelist not found; create tools/vulture-whitelist.txt to ignore known findings.")
    sys.exit(1)

whitelist = [l.strip() for l in WHITELIST.read_text().splitlines() if l.strip() and not l.strip().startswith('#')]

# Run vulture over backend/src and frontend/src to check for dead code in source.
cmd = [sys.executable, '-m', 'vulture', 'backend/src', 'frontend/src', '--min-confidence', '60']
print('Running:', ' '.join(cmd))
proc = subprocess.run(cmd, capture_output=True, text=True)
stdout = proc.stdout.strip()
if not stdout:
    print('No vulture findings.')
    sys.exit(0)

lines = stdout.splitlines()
filtered = []
for line in lines:
    # Skip lines matching any whitelist substring
    if any(w in line for w in whitelist):
        continue
    filtered.append(line)

if not filtered:
    print('Vulture ran; all findings are whitelisted. No action required.')
    sys.exit(0)

# Print findings and fail
print('Unwhitelisted vulture findings:')
for l in filtered:
    print(l)

# Optionally, exit non-zero to fail CI
sys.exit(2)
