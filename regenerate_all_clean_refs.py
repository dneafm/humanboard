import json
import os

from comic_engine import create_clean_reference_variant

CONFIG_PATH = "series_config.json"


def main():
    if not os.path.exists(CONFIG_PATH):
        raise SystemExit("series_config.json not found")

    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)

    changed = []
    for category in ("characters", "objects", "settings"):
        items = config.get(category) or []
        for item in items:
            if not isinstance(item, dict):
                continue
            ref_path = str(item.get("image_ref_path") or "").strip()
            if not ref_path:
                continue
            local_ref = ref_path.lstrip('/\\')
            if not os.path.exists(local_ref):
                print(f"skip missing: {category}/{item.get('name','?')} -> {local_ref}")
                continue
            print(f"regenerating: {category}/{item.get('name','?')} from {local_ref}")
            out = create_clean_reference_variant(
                local_ref,
                asset_name=str(item.get("name") or ""),
                asset_description=str(item.get("description") or ""),
            )
            if out and os.path.exists(out):
                item["clean_image_ref_path"] = f"/{os.path.basename(out)}"
                changed.append((category, item.get("name") or "", out))
                print(f"  ok -> {out}")
            else:
                print(f"  failed -> {category}/{item.get('name','?')}")

    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    print("DONE")
    for category, name, out in changed:
        print(f"{category}: {name} => {out}")


if __name__ == "__main__":
    main()
