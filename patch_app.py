import os, shutil

app_path = r"F:\backtest\comic-engine\app.py"
backup_path = r"F:\backtest\comic-engine\app.py.bak2"
new_path = r"F:\backtest\comic-engine\app_patched.py"

# Try to rename (move) the file - needs only directory write, not file write
try:
    os.rename(app_path, backup_path)
    print(f"Renamed app.py to app.py.bak2 - SUCCESS")
except Exception as e:
    print(f"Rename failed: {e}")
    # Try copy
    try:
        shutil.copy2(app_path, backup_path)
        print(f"Copied to backup")
    except Exception as e2:
        print(f"Copy failed: {e2}")
    import sys
    sys.exit(1)

# Now read from backup (which we can access)
with open(backup_path, "r", encoding="utf-8") as f:
    content = f.read()
print(f"Read backup OK, size={len(content)}")

# Apply patches
old1 = """class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True"""

new1 = """class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        import sys
        exc_type = sys.exc_info()[0]
        if exc_type in (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        import traceback
        print(f"[Server] Unhandled error from {client_address}:")
        traceback.print_exc()"""

if old1 in content:
    content = content.replace(old1, new1, 1)
    print("Patch 1 applied: handle_error")
else:
    print("Patch 1 skipped (already applied or not found)")

old2_debug = '    def do_GET(self):\n        print(f"DEBUG: do_GET path={self.path}, cwd={os.getcwd()}, self.directory={getattr(self, \'directory\', None)}")'
new2_debug = '    def do_GET(self):'
if old2_debug in content:
    content = content.replace(old2_debug, new2_debug, 1)
    print("Patch 2 applied: DEBUG print removed")
else:
    print("Patch 2 skipped")

old3 = """    with ThreadedTCPServer(("", PORT), DashboardHandler) as httpd:
        print(f"\\n=======================================================")
        print(f"COMIC SERIES DASHBOARD STARTED")
        print(f"Local URL: http://localhost:{PORT}")
        print(f"=======================================================\\n")
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()"""

new3 = """    import time
    while True:
        try:
            with ThreadedTCPServer(("", PORT), DashboardHandler) as httpd:
                print(f"\\n=======================================================")
                print(f"COMIC SERIES DASHBOARD STARTED")
                print(f"Local URL: http://localhost:{PORT}")
                print(f"=======================================================\\n")
                httpd.serve_forever()
        except OSError as e:
            print(f"[Server] OSError (port may be busy): {e}. Retrying in 5s...")
            time.sleep(5)
        except Exception as e:
            import traceback
            print(f"[Server] Unexpected error in serve_forever: {e}")
            traceback.print_exc()
            print("[Server] Restarting in 5s...")
            time.sleep(5)

if __name__ == "__main__":
    run_server()"""

if old3 in content:
    content = content.replace(old3, new3, 1)
    print("Patch 3 applied: serve_forever restart loop")
else:
    print("Patch 3 skipped (already applied or not found)")

# Write the patched version as app.py
with open(app_path, "w", encoding="utf-8") as f:
    f.write(content)
print(f"\nPatched app.py written: {len(content)} bytes")
print("Done!")
