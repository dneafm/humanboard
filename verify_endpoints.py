import urllib.request
import urllib.error
import json

base_url = 'http://100.112.81.33:8091'

print("=== VERIFYING ENDPOINTS ===")

# Test 1: Config endpoint
try:
    with urllib.request.urlopen(f"{base_url}/api/auth/config") as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(f"[/api/auth/config] Success: {data}")
except Exception as e:
    print(f"[/api/auth/config] Failed: {e}")

# Test 2: Status endpoint
try:
    with urllib.request.urlopen(f"{base_url}/api/auth/status") as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(f"[/api/auth/status] Success: {data}")
except Exception as e:
    print(f"[/api/auth/status] Failed: {e}")

# Test 3: Guarded API discover endpoint (should return 401)
try:
    urllib.request.urlopen(f"{base_url}/api/discover")
    print("[/api/discover] Error: Accessed guarded API without authentication!")
except urllib.error.HTTPError as e:
    content = e.read().decode('utf-8')
    print(f"[/api/discover] Success: Expected failure with code {e.code}, body: {content}")
except Exception as e:
    print(f"[/api/discover] Failed unexpectedly: {e}")
