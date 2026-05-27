import json
import os
import re
import unicodedata
from datetime import datetime, timezone


DB_FILE = "series_database.json"
ACTIVE_SERIES_ID = "active"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def slugify(value):
    normalized = unicodedata.normalize("NFC", str(value or "").strip().lower())
    slug = re.sub(r"[^\w.-]+", "_", normalized, flags=re.UNICODE).strip("._")
    return slug or "item"


def read_json(path, default=None):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def clean_ref_path(path):
    if not path:
        return ""
    return os.path.basename(str(path).split("?", 1)[0].lstrip("/\\"))


def ref_entry(path, source, episode_number=None, frame_number=None):
    raw_path = str(path or "").split("?", 1)[0].lstrip("/\\")
    local_path = os.path.normpath(raw_path) if raw_path else ""
    if local_path.startswith("..") or os.path.isabs(local_path):
        local_path = clean_ref_path(path)
    if not local_path:
        return None
    public_path = local_path.replace("\\", "/")
    entry = {
        "path": f"/{public_path}",
        "source": source,
        "exists": os.path.exists(local_path),
    }
    if episode_number is not None:
        entry["episode_number"] = episode_number
    if frame_number is not None:
        entry["frame_number"] = frame_number
    return entry


def add_ref(record, entry):
    if not entry:
        return
    refs = record.setdefault("image_refs", [])
    key = (entry.get("path"), entry.get("source"), entry.get("episode_number"), entry.get("frame_number"))
    if not any((r.get("path"), r.get("source"), r.get("episode_number"), r.get("frame_number")) == key for r in refs):
        refs.append(entry)


def make_empty_database():
    return {
        "version": 1,
        "active_series_id": ACTIVE_SERIES_ID,
        "series": [],
        "characters": [],
        "assets": [],
        "episodes": [],
        "updated_at": now_iso(),
    }


def asset_record(series_id, category, asset):
    name = str(asset.get("name") or "").strip()
    description = str(asset.get("description") or "").strip()
    record = {
        "id": f"{category}_{slugify(name)}",
        "series_id": series_id,
        "category": category,
        "name": name,
        "description": description,
        "image_refs": [],
        "aliases": [name] if name else [],
        "updated_at": now_iso(),
    }
    add_ref(record, ref_entry(asset.get("image_ref_path"), "input"))
    return record


def text_mentions_name(text, name):
    if not text or not name:
        return False
    return name.casefold() in text.casefold()


def rebuild_database_from_files():
    config = read_json("series_config.json", {}) or {}
    db = make_empty_database()

    characters = [item for item in config.get("characters", []) if isinstance(item, dict)]
    settings = [item for item in config.get("settings", []) if isinstance(item, dict)]
    objects = [item for item in config.get("objects", []) if isinstance(item, dict)]

    protagonist_name = str(config.get("protagonist_name") or (characters[0].get("name") if characters else "Protagonist")).strip()
    protagonist_description = str(config.get("protagonist_description") or (characters[0].get("description") if characters else "")).strip()
    setting_description = str(config.get("setting_description") or (settings[0].get("description") if settings else "")).strip()

    series = {
        "id": ACTIVE_SERIES_ID,
        "name": str(config.get("series_title") or f"{protagonist_name} Series").strip(),
        "context": str(config.get("series_plot") or setting_description).strip(),
        "setting_context": setting_description,
        "protagonist_name": protagonist_name,
        "protagonist_description": protagonist_description,
        "master_style_suffix": str(config.get("master_style_suffix") or "").strip(),
        "character_ids": [],
        "asset_ids": [],
        "episode_ids": [],
        "updated_at": now_iso(),
    }

    for item in characters:
        record = asset_record(ACTIVE_SERIES_ID, "characters", item)
        db["characters"].append(record)
        series["character_ids"].append(record["id"])

    for category, items in (("objects", objects), ("settings", settings)):
        for item in items:
            record = asset_record(ACTIVE_SERIES_ID, category, item)
            db["assets"].append(record)
            series["asset_ids"].append(record["id"])

    episode_files = []
    for filename in os.listdir("."):
        if filename.startswith("episode_") and filename.endswith(".json"):
            try:
                number = int(filename.replace("episode_", "").replace(".json", ""))
            except ValueError:
                continue
            episode_files.append((number, filename))

    for number, filename in sorted(episode_files):
        payload = read_json(filename, {}) or {}
        episode_id = f"episode_{number}"
        frames = []
        searchable_chunks = [payload.get("episode_title", ""), payload.get("tutorial_summary", ""), payload.get("caption_post", ""), payload.get("topic", "")]

        for frame in payload.get("frames", []) or []:
            if not isinstance(frame, dict):
                continue
            frame_number = frame.get("frame_number", len(frames) + 1)
            image_path = f"episode_{number}_panels/panel_{frame_number}.png"
            prompt_text = frame.get("image_generation_prompt", "")
            frame_text = json.dumps(frame, ensure_ascii=False)
            searchable_chunks.append(frame_text)
            frames.append({
                "frame_number": frame_number,
                "panel_type": frame.get("panel_type", ""),
                "prompt_text": prompt_text,
                "text_overlay_vietnamese": frame.get("text_overlay_vietnamese", ""),
                "text_overlays": frame.get("text_overlays", []),
                "image_path": f"/{image_path}",
                "image_exists": os.path.exists(image_path),
            })

        searchable_text = "\n".join(searchable_chunks)
        mentions_primary = text_mentions_name(searchable_text, protagonist_name)
        matched_asset_ids = []
        for record in db["characters"] + db["assets"]:
            if text_mentions_name(searchable_text, record.get("name", "")):
                matched_asset_ids.append(record.get("id"))
                if not protagonist_name or mentions_primary:
                    for frame in frames:
                        if text_mentions_name(json.dumps(frame, ensure_ascii=False), record.get("name", "")):
                            add_ref(record, ref_entry(frame.get("image_path"), "episode", number, frame.get("frame_number")))

        episode = {
            "id": episode_id,
            "series_id": ACTIVE_SERIES_ID,
            "episode_number": number,
            "title": payload.get("episode_title", ""),
            "topic": payload.get("topic", ""),
            "summary": payload.get("tutorial_summary", ""),
            "caption_post": payload.get("caption_post", ""),
            "prompt_text": payload.get("prompt_text", ""),
            "frames": frames,
            "matched_asset_ids": [item for item in matched_asset_ids if item],
            "mentions_primary_character": mentions_primary,
            "created_at": datetime.fromtimestamp(os.path.getmtime(filename), timezone.utc).isoformat() if os.path.exists(filename) else now_iso(),
            "updated_at": now_iso(),
        }
        db["episodes"].append(episode)
        series["episode_ids"].append(episode_id)

    db["series"].append(series)
    db["updated_at"] = now_iso()
    write_json(DB_FILE, db)
    return db


def load_database(rebuild=False):
    if rebuild or not os.path.exists(DB_FILE):
        return rebuild_database_from_files()
    data = read_json(DB_FILE)
    if not isinstance(data, dict) or data.get("version") != 1:
        return rebuild_database_from_files()
    return data


def active_series(db=None):
    db = db or load_database()
    active_id = db.get("active_series_id", ACTIVE_SERIES_ID)
    return next((series for series in db.get("series", []) if series.get("id") == active_id), None) or {}


def all_mention_records(db=None):
    db = db or load_database()
    records = []
    for category, items in (("characters", db.get("characters", [])), ("assets", db.get("assets", []))):
        for item in items:
            records.append({
                "id": item.get("id"),
                "kind": category[:-1] if category.endswith("s") else category,
                "category": item.get("category", category),
                "name": item.get("name", ""),
                "description": item.get("description", ""),
                "image_refs": item.get("image_refs", []),
            })
    return [record for record in records if record.get("name")]


def suggest_mentions(query="", limit=12):
    db = load_database(rebuild=True)
    q = str(query or "").strip().casefold()
    records = all_mention_records(db)
    if q:
        records = [
            record for record in records
            if q in record.get("name", "").casefold() or q in record.get("description", "").casefold()
        ]
        records.sort(key=lambda record: (
            not record.get("name", "").casefold().startswith(q),
            q not in record.get("name", "").casefold(),
            record.get("category") != "characters",
            record.get("name", "").casefold(),
        ))
    else:
        records.sort(key=lambda record: (record.get("category") != "characters", record.get("name", "").casefold()))
    return records[:limit]


def resolve_mentions(text, db=None):
    db = db or load_database()
    lowered = str(text or "").casefold()
    matches = []
    for record in all_mention_records(db):
        name = record.get("name", "")
        if name and f"@{name}".casefold() in lowered:
            matches.append(record)
    return matches


def compact_refs(record, limit=3):
    refs = record.get("image_refs", [])
    if not refs:
        return ""
    pieces = []
    for ref in refs[:limit]:
        suffix = ""
        if ref.get("source") == "episode":
            suffix = f" ep{ref.get('episode_number')}/f{ref.get('frame_number')}"
        pieces.append(f"{ref.get('path')} ({ref.get('source')}{suffix})")
    return "; ".join(pieces)


def build_generation_context(topic=""):
    db = load_database(rebuild=True)
    series = active_series(db)
    mentions = resolve_mentions(topic, db)
    mention_ids = {item.get("id") for item in mentions}

    lines = [
        "# ACTIVE SERIES DATABASE",
        f"Series: {series.get('name', 'Active Series')}",
        f"Context: {series.get('context', '')}",
        f"Setting Context: {series.get('setting_context', '')}",
        f"Master Style Suffix: {series.get('master_style_suffix', '')}",
        "",
        "## Characters",
    ]

    for record in db.get("characters", []):
        marker = " [MENTIONED]" if record.get("id") in mention_ids else ""
        refs = compact_refs(record)
        ref_text = f" | refs: {refs}" if refs else ""
        lines.append(f"- @{record.get('name')}{marker}: {record.get('description', '')}{ref_text}")

    lines.append("")
    lines.append("## Assets & Settings")
    for record in db.get("assets", []):
        marker = " [MENTIONED]" if record.get("id") in mention_ids else ""
        refs = compact_refs(record)
        ref_text = f" | refs: {refs}" if refs else ""
        lines.append(f"- @{record.get('name')} ({record.get('category')}){marker}: {record.get('description', '')}{ref_text}")

    primary_name = str(series.get("protagonist_name") or "").strip()
    recent_pool = db.get("episodes", [])
    if primary_name:
        recent_pool = [episode for episode in recent_pool if episode.get("mentions_primary_character")]
    recent = sorted(recent_pool, key=lambda item: item.get("episode_number", 0), reverse=True)[:5]
    lines.append("")
    lines.append("## Recent Episodes")
    for episode in reversed(recent):
        image_refs = []
        for frame in episode.get("frames", [])[:4]:
            if frame.get("image_exists"):
                image_refs.append(f"F{frame.get('frame_number')}: {frame.get('image_path')}")
        lines.append(f"- Episode {episode.get('episode_number')}: {episode.get('title')} | topic: {episode.get('topic') or episode.get('summary')}")
        if image_refs:
            lines.append(f"  - images: {'; '.join(image_refs)}")

    if mentions:
        lines.append("")
        lines.append("## User @ References To Prioritize")
        for record in mentions:
            lines.append(f"- @{record.get('name')}: {record.get('description', '')}")

    lines.append("")
    lines.append("Use this database as the source of truth. When the user types @Name, prioritize that character/asset/setting and use its descriptions and reference images for continuity. Treat previous episode images as continuity references only; do not import old names, occupations, genres, locations, or art styles unless they also appear in the active series characters/assets/settings above.")
    return "\n".join(lines)


def record_episode_payload(payload, topic=""):
    if isinstance(payload, dict):
        payload["topic"] = topic or payload.get("topic", "")
    return rebuild_database_from_files()
