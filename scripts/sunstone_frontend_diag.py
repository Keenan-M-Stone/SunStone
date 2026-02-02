import requests
import sys
import subprocess
import os

FRONTEND_BASE = 'http://127.0.0.1:5173'


def run_unit_tests():
    print('Running frontend unit tests (vitest)...')
    try:
        proc = subprocess.run(['npm', 'ci'], cwd='frontend', capture_output=True, text=True)
        print(proc.stdout)
        proc = subprocess.run(['npm', 'run', 'test:unit', '--', '--run'], cwd='frontend', capture_output=True, text=True)
        print(proc.stdout)
        if proc.returncode != 0:
            print('Frontend unit tests failed:')
            print(proc.stderr)
            return False
    except Exception as e:
        print('Failed to run frontend tests:', e)
        return False
    return True


def run_build():
    print('Building frontend (vite build)...')
    try:
        proc = subprocess.run(['npm', 'run', 'build'], cwd='frontend', capture_output=True, text=True)
        print(proc.stdout)
        if proc.returncode != 0:
            print('Frontend build failed:')
            print(proc.stderr)
            return False
    except Exception as e:
        print('Failed to run frontend build:', e)
        return False
    return True

# Add more UI endpoints or static asset checks as needed
def check_frontend():
    try:
        r = requests.get(FRONTEND_BASE)
        if r.status_code == 200:
            print('✅ Frontend root reachable')
        else:
            print(f'❌ Frontend root error: {r.status_code}')
            return False
    except Exception as e:
        print(f'❌ Frontend unreachable: {e}')
        return False
    return True

def main():
    ok = check_frontend()
    tests_ok = run_unit_tests()
    build_ok = run_build()
    ok = ok and tests_ok and build_ok
    # Optionally, add more UI/asset checks here
    if ok:
        print('All frontend diagnostics passed.')
    else:
        print('Some frontend diagnostics failed.')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
