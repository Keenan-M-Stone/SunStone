
import subprocess
import sys
import os

def run_script(path):
    print(f'Running {path}...')
    result = subprocess.run([sys.executable, path], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
        return False
    return True

def main():
    ok = run_script('scripts/sunstone_backend_diag.py')
    ok = run_script('scripts/sunstone_frontend_diag.py') and ok

    # Optionally run the full Playwright E2E harness (starts servers, runs tests)
    if os.environ.get('RUN_E2E', '0') == '1':
        print('RUN_E2E=1 detected; running full e2e.sh (Playwright)...')
        res = subprocess.run(['bash', 'scripts/e2e.sh'], capture_output=True, text=True)
        print(res.stdout)
        if res.returncode != 0:
            print(res.stderr)
            ok = False

    if ok:
        print('All full-stack diagnostics passed.')
    else:
        print('Some diagnostics failed.')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
