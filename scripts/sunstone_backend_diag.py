
import requests
import sys
import subprocess

API_BASE = 'http://127.0.0.1:8000'

def check_api():
    try:
        r = requests.get(f'{API_BASE}/docs')
        if r.status_code == 200:
            print('✅ API docs reachable')
        else:
            print(f'❌ API docs error: {r.status_code}')
            return False
    except Exception as e:
        print(f'❌ API docs unreachable: {e}')
        return False
    return True

def create_project():
    try:
        r = requests.post(f'{API_BASE}/projects', json={"name": "diag-proj"})
        if r.status_code == 200:
            print('✅ Project created')
            return r.json()['id']
        else:
            print(f'❌ Project creation error: {r.status_code}')
            return None
    except Exception as e:
        print(f'❌ Project creation failed: {e}')
        return None

def create_run(project_id):
    try:
        r = requests.post(f'{API_BASE}/projects/{project_id}/runs', json={"spec": {}})
        if r.status_code == 200:
            print('✅ Run created')
            return r.json()['id']
        else:
            print(f'❌ Run creation error: {r.status_code}')
            return None
    except Exception as e:
        print(f'❌ Run creation failed: {e}')
        return None


def check_resource(run_id):
    try:
        r = requests.get(f'{API_BASE}/runs/{run_id}/resource')
        if r.status_code == 200:
            print('✅ Resource endpoint reachable')
            print('Response:', r.json())
        elif r.status_code == 404:
            print('⚠️  Resource not found (expected for new runs)')
            return True
        else:
            print(f'❌ Resource endpoint error: {r.status_code}')
            return False
    except Exception as e:
        print(f'❌ Resource endpoint unreachable: {e}')
        return False
    return True

def run_pytest():
    print('Running backend pytest...')
    try:
        proc = subprocess.run([sys.executable, '-m', 'pytest', '-q'], cwd='backend', capture_output=True, text=True)
        print(proc.stdout)
        if proc.returncode != 0:
            print('Pytest failures:')
            print(proc.stderr)
            return False
    except Exception as e:
        print('Failed to run pytest:', e)
        return False
    return True


def main():
    ok = check_api()
    # run backend unit tests as part of diagnostics
    tests_ok = run_pytest()
    if not tests_ok:
        print('Backend unit tests failed; skipping run creation.')
        sys.exit(1)
    project_id = create_project()
    if not project_id:
        print('Some backend diagnostics failed.')
        sys.exit(1)
    run_id = create_run(project_id)
    if not run_id:
        print('Some backend diagnostics failed.')
        sys.exit(1)
    ok = check_resource(run_id) and ok
    if ok:
        print('All backend diagnostics passed.')
    else:
        print('Some backend diagnostics failed.')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
