@echo off
cd /d F:\backtest\comic-engine
.venv\Scripts\python.exe -c "import urllib.request, json, config; payload = {'model': 'gemini-3.1-flash-image', 'prompt': 'a simple stick figure', 'size': '1024x1024', 'n': 1}; req = urllib.request.Request('http://127.0.0.1:8317/v1/images/generations', data=json.dumps(payload).encode('utf-8'), headers={'Authorization': 'Bearer ' + config.BEARER_API_KEY, 'Content-Type': 'application/json'}, method='POST'); print(urllib.request.urlopen(req).read().decode()[:400])"
