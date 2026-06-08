"""
Patch app.py on a live Windows server by directly overwriting it byte-by-byte.
Python's import system doesn't hold an exclusive write lock on .py source files
after the initial import, so we can overwrite in place.
"""
import os, sys, shutil

staged = r"F:\backtest\comic-engine\app_staged.py"
target = r"F:\backtest\comic-engine\app.py"

if not os.path.exists(staged):
    print(f"ERROR: staged file not found: {staged}")
    sys.exit(1)

with open(staged, "rb") as f:
    new_content = f.read()

# Try direct overwrite first
try:
    with open(target, "wb") as f:
        f.write(new_content)
    print("Direct overwrite succeeded!")
except PermissionError as e:
    print(f"Direct write blocked: {e}")
    # Fallback: write to .tmp then use MoveFileEx via ctypes (replaces even locked files)
    tmp = target + ".tmp"
    with open(tmp, "wb") as f:
        f.write(new_content)
    import ctypes
    MOVEFILE_REPLACE_EXISTING = 0x1
    MOVEFILE_WRITE_THROUGH    = 0x8
    ok = ctypes.windll.kernel32.MoveFileExW(tmp, target,
             MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)
    if ok:
        print("MoveFileEx overwrite succeeded!")
    else:
        err = ctypes.windll.kernel32.GetLastError()
        print(f"MoveFileEx failed with error code {err}")
        sys.exit(1)

# Verify parse
print(f"Verifying {target} ...")
with open(target, "rb") as f:
    src_bytes = f.read()
assert b"/api/assets/reclean" in src_bytes, "reclean endpoint missing!"
print("Verification passed — /api/assets/reclean is present in app.py")
print("Done. Restart the server to apply changes.")
