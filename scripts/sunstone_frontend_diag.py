import requests
import sys

FRONTEND_BASE = 'http://127.0.0.1:5173'

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
    # Optionally, add more UI/asset checks here
    if ok:
        print('All frontend diagnostics passed.')
    else:
        print('Some frontend diagnostics failed.')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
