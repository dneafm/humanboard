import urllib.request
import json

def get_info():
    url = "https://www.surplusintelligence.ai/api/x402/info"
    print(f"Querying: {url}")
    
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode())
            print("\n✅ SUCCESS!")
            print(json.dumps(res, indent=2))
    except Exception as e:
        print("❌ FAILED:", e)
        if hasattr(e, 'read'):
            try:
                print("Error details:", e.read().decode())
            except Exception:
                pass

if __name__ == "__main__":
    get_info()
