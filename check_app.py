import subprocess, sys, time, os

# Check what's in the remote app.py run_server
app_path = r"F:\backtest\comic-engine\app.py"
with open(app_path, encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

# Print lines 1150-1181
print("=== app.py run_server (last 30 lines) ===")
for i, line in enumerate(lines[1150:], start=1151):
    print(f"{i}: {line}", end="")

print("\n\n=== auto_generate_queue.py ===")
aq_path = r"F:\backtest\comic-engine\auto_generate_queue.py"
if os.path.exists(aq_path):
    with open(aq_path, encoding="utf-8", errors="replace") as f:
        print(f.read())
else:
    print("File not found")
