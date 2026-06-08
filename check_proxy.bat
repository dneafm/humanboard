@echo off
cd /d F:\backtest\comic-engine
.venv\Scripts\python.exe -c "import urllib.request, json, config; req = urllib.request.Request('http://127.0.0.1:8317/v1/models', headers={'Authorization': 'Bearer ' + config.BEARER_API_KEY}); print(urllib.request.urlopen(req).read().decode())"
