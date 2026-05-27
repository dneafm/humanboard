import urllib.request
import json

def get_models():
    url = "https://www.surplusintelligence.ai/api/inference/v1/models"
    print(f"Querying: {url}")
    
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode())
            print("\n✅ SUCCESS!")
            models = res.get("data", [])
            for m in models:
                if "flux" in m.get("id", "").lower() or "image" in m.get("id", "").lower() or "generate" in m.get("id", "").lower():
                    print(json.dumps(m, indent=2))
    except Exception as e:
        print("❌ FAILED:", e)
        if hasattr(e, 'read'):
            try:
                print("Error details:", e.read().decode())
            except Exception:
                pass

if __name__ == "__main__":
    get_models()
