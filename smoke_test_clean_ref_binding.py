import importlib.util
import inspect
import os
import sys

ROOT = os.path.dirname(__file__)
MODULE_PATH = os.path.join(ROOT, "comic_engine.py")
APP_PATH = os.path.join(ROOT, "app.py")


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    comic_engine = load_module("comic_engine_smoke", MODULE_PATH)
    sig = inspect.signature(comic_engine.create_clean_reference_variant)
    expected = "(image_path, asset_name='', asset_description='')"
    actual = str(sig)
    if actual != expected:
        raise AssertionError(f"Unexpected create_clean_reference_variant signature: {actual} != {expected}")

    line_no = inspect.getsourcelines(comic_engine.create_clean_reference_variant)[1]
    if line_no >= 1879:
        raise AssertionError(f"create_clean_reference_variant appears to be shadowed again at line {line_no}")

    load_module("comic_engine_app_smoke", APP_PATH)
    print("OK: clean ref binding and app import verified")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"SMOKE TEST FAILED: {exc}")
        sys.exit(1)
