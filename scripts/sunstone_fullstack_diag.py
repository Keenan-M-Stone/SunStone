import requests
import sys

API_BASE = 'http://127.0.0.1:8000'
FRONTEND_BASE = 'http://127.0.0.1:5173'

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

def check_resource(run_id='test'):
    try:
        r = requests.get(f'{API_BASE}/runs/{run_id}/resource')
        if r.status_code == 200:
            print('✅ Resource endpoint reachable')
            print('Response:', r.json())
        else:
            print(f'❌ Resource endpoint error: {r.status_code}')
            return False
    except Exception as e:
        print(f'❌ Resource endpoint unreachable: {e}')
        return False
    return True

def check_frontend():
    try:
        r = requests.get(FRONTEND_BASE)
        if r.status_code == 200:
            print('✅ Frontend reachable')
        else:
            print(f'❌ Frontend error: {r.status_code}')
            return False
    except Exception as e:
        print(f'❌ Frontend unreachable: {e}')
        return False
    return True

def main():
    ok = check_api()
    ok = check_resource() and ok
    ok = check_frontend() and ok
    if ok:
        print('All full-stack diagnostics passed.')
    else:
        print('Some diagnostics failed.')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
