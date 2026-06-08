import urllib.request
import json

data = json.dumps({
    "topic": "test topic",
    "frame_count": 4,
    "comic_language": "vn"
}).encode('utf-8')

req = urllib.request.Request(
    "http://localhost:8080/api/generate",
    data=data,
    headers={'Content-Type': 'application/json'}
)

try:
    with urllib.request.urlopen(req) as response:
        print("Response Code:", response.getcode())
        print("Response Body:", response.read().decode('utf-8'))
except Exception as e:
    print("Error:", e)
