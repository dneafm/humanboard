import os, sys

out_log = r"F:\backtest\comic-engine\logs\app.task.out.log"
err_log = r"F:\backtest\comic-engine\logs\app.task.err.log"

print("=== STDOUT tail (last 60 lines) ===")
if os.path.exists(out_log):
    with open(out_log, encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
    clean = [l.replace('\x00','') for l in lines]
    print("".join(clean[-60:]))
else:
    print("Not found")

print("\n=== STDERR (all) ===")
if os.path.exists(err_log):
    with open(err_log, encoding="utf-8", errors="replace") as f:
        content = f.read()
    clean = content.replace('\x00','')
    if clean.strip():
        print(clean[-3000:])
    else:
        print("(empty)")
else:
    print("Not found")
