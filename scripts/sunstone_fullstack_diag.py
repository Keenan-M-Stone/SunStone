
import subprocess
import sys

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
    if ok:
        print('All full-stack diagnostics passed.')
    else:
        print('Some diagnostics failed.')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
