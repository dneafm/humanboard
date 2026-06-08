import http.server
import socketserver
import json
import os
import re
import subprocess
import threading
import unicodedata
import urllib.parse

PORT = 8080

CONFIG_LOCK = threading.RLock()
ASSET_TYPES = {"characters", "objects", "settings"}
DEFAULT_STYLE_SUFFIX = "[, rough black-and-white indie comic, wobbly hand-drawn ink lines, minimal flat background, awkward deadpan expressions, imperfect anatomy, DIY zine texture, sparse composition, low-polish handmade panel art --ar 4:3]"
DEFAULT_FRAME_COUNT = 4
MIN_FRAME_COUNT = 1
MAX_FRAME_COUNT = 30
DEFAULT_COMIC_LANGUAGE = "vn"


def parse_frame_count(value, default=DEFAULT_FRAME_COUNT):
    try:
        count = int(value)
    except (TypeError, ValueError):
        count = default
    return max(MIN_FRAME_COUNT, min(MAX_FRAME_COUNT, count))


def normalize_comic_language(value, default=None):
    if not value:
        try:
            if os.path.exists("series_config.json"):
                with open("series_config.json", "r", encoding="utf-8") as f:
                    value = json.load(f).get("comic_language")
        except Exception:
            pass
    if not value:
        value = default or DEFAULT_COMIC_LANGUAGE
    language = str(value).strip().lower()
    return "en" if language == "en" else "vn"


def send_json(handler, status, payload):
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


def asset_slug(name):
    normalized = unicodedata.normalize("NFC", (name or "").strip().lower())
    slug = re.sub(r"[^\w.-]+", "_", normalized, flags=re.UNICODE).strip("._")
    return slug or "asset"


def asset_filename(asset_type, name):
    suffix = "_face.png" if asset_type == "characters" else "_ref.png"
    return f"{asset_slug(name)}{suffix}"


def clean_local_ref_path(ref_path):
    if not ref_path:
        return ""
    return os.path.basename(str(ref_path).split("?", 1)[0].lstrip("/\\"))


def preferred_asset_ref(asset_type, name):
    if asset_type == "settings" and os.path.exists("setting_ref.png"):
        return "/setting_ref.png"
    return f"/{asset_filename(asset_type, name)}"


def normalize_asset(asset_type, item, fallback_name="", fallback_description=""):
    item = item if isinstance(item, dict) else {}
    name = str(item.get("name") or fallback_name or "").strip()
    description = str(item.get("description") or fallback_description or "").strip()
    if not name and not description:
        return None

    ref_path = str(item.get("image_ref_path") or "").strip()
    if ref_path:
        local_ref = clean_local_ref_path(ref_path)
        expected_stem = asset_slug(name)
        if os.path.exists(local_ref) or local_ref.startswith(expected_stem) or local_ref == "setting_ref.png":
            ref_path = f"/{local_ref}"
        else:
            ref_path = preferred_asset_ref(asset_type, name)
    else:
        ref_path = preferred_asset_ref(asset_type, name)

    return {
        "name": name or fallback_name or "Asset",
        "description": description,
        "image_ref_path": ref_path,
    }


def normalize_series_config(config_data):
    config_data = config_data if isinstance(config_data, dict) else {}
    before = json.dumps(config_data, sort_keys=True, ensure_ascii=False)

    protagonist_name = str(config_data.get("protagonist_name") or "Protagonist").strip()
    protagonist_description = str(config_data.get("protagonist_description") or "").strip()
    setting_description = str(config_data.get("setting_description") or "").strip()

    characters = [
        normalize_asset("characters", item)
        for item in config_data.get("characters", [])
        if isinstance(item, dict)
    ]
    characters = [item for item in characters if item]
    if not characters and (protagonist_name or protagonist_description):
        characters.append(normalize_asset("characters", {}, protagonist_name, protagonist_description))

    objects = [
        normalize_asset("objects", item)
        for item in config_data.get("objects", [])
        if isinstance(item, dict)
    ]
    objects = [item for item in objects if item]

    settings = [
        normalize_asset("settings", item)
        for item in config_data.get("settings", [])
        if isinstance(item, dict)
    ]
    settings = [item for item in settings if item]
    if not settings and setting_description:
        settings.append(normalize_asset("settings", {}, "Bối Cảnh Chính", setting_description))

    config_data["characters"] = characters
    config_data["objects"] = objects
    config_data["settings"] = settings
    config_data["master_style_suffix"] = str(config_data.get("master_style_suffix") or DEFAULT_STYLE_SUFFIX).strip()

    if characters:
        config_data["protagonist_name"] = characters[0]["name"]
        config_data["protagonist_description"] = characters[0]["description"]
    if settings:
        config_data["setting_description"] = settings[0]["description"]

    after = json.dumps(config_data, sort_keys=True, ensure_ascii=False)
    return config_data, before != after


def load_series_config(config_path="series_config.json", migrate=True):
    with CONFIG_LOCK:
        config_data = {}
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    config_data = json.load(f)
            except Exception as e:
                print(f"Error reading config: {e}")

        config_data, modified = normalize_series_config(config_data)
        if migrate and modified:
            try:
                with open(config_path, "w", encoding="utf-8") as f:
                    json.dump(config_data, f, ensure_ascii=False, indent=2)
                print("Migrated and saved series config.")
            except Exception as e:
                print(f"Error saving migrated config: {e}")
        return config_data


def decorate_asset_images(config_data):
    for category in ASSET_TYPES:
        for asset in config_data.get(category, []):
            local_path = clean_local_ref_path(asset.get("image_ref_path"))
            asset["has_image"] = bool(local_path and os.path.exists(local_path))
    ref_path = clean_local_ref_path(config_data.get("style_reference_path"))
    config_data["has_style_reference"] = bool(ref_path and os.path.exists(ref_path))
    return config_data


def iter_reference_files(config_data=None):
    refs = set()
    if config_data is None and os.path.exists("series_config.json"):
        config_data = load_series_config(migrate=False)
    if isinstance(config_data, dict):
        for category in ASSET_TYPES:
            for asset in config_data.get(category, []):
                local_path = clean_local_ref_path(asset.get("image_ref_path"))
                if local_path and os.path.isfile(local_path):
                    refs.add(local_path)
        style_ref = clean_local_ref_path(config_data.get("style_reference_path"))
        if style_ref and os.path.isfile(style_ref):
            refs.add(style_ref)

    for filename in os.listdir("."):
        if os.path.isfile(filename) and (filename.endswith("_face.png") or filename.endswith("_ref.png") or filename == "setting_ref.png" or filename == "style_ref.png"):
            refs.add(filename)
    return sorted(refs)


GENERATION_STATUS = {
    "active": False,
    "episode_number": None,
    "stage": "idle",
    "current_panel": 0,
    "total_panels": 0,
    "error": None,
    "topic": ""
}

def save_generation_progress():
    try:
        with open("generation_progress.json", "w", encoding="utf-8") as f:
            json.dump(GENERATION_STATUS, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving generation progress: {e}")

def load_generation_progress():
    global GENERATION_STATUS
    if os.path.exists("generation_progress.json"):
        try:
            with open("generation_progress.json", "r", encoding="utf-8") as f:
                GENERATION_STATUS = json.load(f)
        except Exception:
            pass
    # Force inactive status on server boot to prevent lockouts from unclean shutdowns
    GENERATION_STATUS["active"] = False
    save_generation_progress()

def run_generation_task(topic, next_num, frame_count, comic_language, existing_titles):
    global GENERATION_STATUS
    try:
        from comic_engine import ComicEngine, save_episode, generate_panels_for_episode, prepare_episode_payload_for_generation
        from series_db import build_generation_context, record_episode_payload
        
        engine = ComicEngine()
        
        if not topic:
            GENERATION_STATUS["stage"] = "suggest_topic"
            save_generation_progress()
            topic = engine.suggest_next_topic(existing_titles)
            GENERATION_STATUS["topic"] = topic
            
        GENERATION_STATUS["stage"] = "script"
        save_generation_progress()
        
        database_context = build_generation_context(topic)
        payload = engine.generate_episode(topic, episode_num=next_num, database_context=database_context, frame_count=frame_count, comic_language=comic_language)
        payload["topic"] = topic
        payload["prompt_text"] = topic
        payload["comic_language"] = comic_language
        payload["frame_count"] = frame_count
        payload = prepare_episode_payload_for_generation(payload)
        save_episode(payload)
        record_episode_payload(payload, topic)
        
        GENERATION_STATUS["stage"] = "panel"
        GENERATION_STATUS["total_panels"] = len(payload.get("frames", []))
        GENERATION_STATUS["current_panel"] = 0
        save_generation_progress()
        
        def progress_callback(current, total, done=False):
            global GENERATION_STATUS
            if done:
                GENERATION_STATUS["stage"] = "completed"
                GENERATION_STATUS["active"] = False
                GENERATION_STATUS["current_panel"] = total
            else:
                GENERATION_STATUS["current_panel"] = current
            save_generation_progress()
            
        generate_panels_for_episode(payload, progress_callback=progress_callback)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        GENERATION_STATUS["active"] = False
        GENERATION_STATUS["error"] = str(e)
        save_generation_progress()


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        import sys
        exc_type = sys.exc_info()[0]
        # Silently ignore connection errors (BrokenPipe, ConnectionReset) - normal for HTTP
        if exc_type in (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return
        # Log unexpected errors but don't crash the server
        import traceback
        print(f"[Server] Unhandled error from {client_address}:")
        traceback.print_exc()

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress request logging to keep console clean unless debug is needed
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        request_path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        # API: Get list of all series
        if request_path == "/api/series":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            
            series_list = []
            
            # Helper to extract metadata
            def get_series_metadata(directory, is_active=False, folder_name="active"):
                config_path = os.path.join(directory, "series_config.json")
                protagonist_name = "Protagonist"
                protagonist_description = "The active series protagonist"
                setting_description = "The active series setting"
                
                if os.path.exists(config_path):
                    try:
                        with open(config_path, "r", encoding="utf-8") as f:
                            config_data = json.load(f)
                            protagonist_name = config_data.get("protagonist_name", "Protagonist")
                            protagonist_description = config_data.get("protagonist_description", protagonist_description)
                            setting_description = config_data.get("setting_description", setting_description)
                    except Exception:
                        pass
                        
                episode_files = [f for f in os.listdir(directory) if f.startswith("episode_") and f.endswith(".json")]
                
                timestamp = "Active"
                if folder_name.startswith("archived_series_"):
                    parts = folder_name.replace("archived_series_", "").split("_")
                    if len(parts) >= 2:
                        date_str = parts[0]
                        time_str = parts[1]
                        if len(date_str) == 8 and len(time_str) == 6:
                            timestamp = f"{date_str[0:4]}-{date_str[4:6]}-{date_str[6:8]} {time_str[0:2]}:{time_str[2:4]}:{time_str[4:6]}"
                        else:
                            timestamp = folder_name.replace("archived_series_", "")
                    else:
                        timestamp = folder_name.replace("archived_series_", "")
                        
                return {
                    "id": folder_name,
                    "protagonist_name": protagonist_name,
                    "protagonist_description": protagonist_description,
                    "setting_description": setting_description,
                    "is_active": is_active,
                    "episodes_count": len(episode_files),
                    "timestamp": timestamp
                }
            
            # 1. Get active series
            try:
                active_meta = get_series_metadata(".", is_active=True, folder_name="active")
                series_list.append(active_meta)
            except Exception as e:
                print(f"Error getting active series metadata: {e}")
                
            # 2. Get archived series
            archive_path = "./archive"
            if os.path.exists(archive_path) and os.path.isdir(archive_path):
                for item in os.listdir(archive_path):
                    item_path = os.path.join(archive_path, item)
                    if os.path.isdir(item_path) and item.startswith("archived_series_"):
                        try:
                            meta = get_series_metadata(item_path, is_active=False, folder_name=item)
                            series_list.append(meta)
                        except Exception as e:
                            print(f"Error getting archived series metadata for {item}: {e}")
            
            # Sort: active first, then archived by timestamp descending
            archived = [s for s in series_list if not s["is_active"]]
            archived.sort(key=lambda x: x["id"], reverse=True)
            
            final_list = [s for s in series_list if s["is_active"]] + archived
            
            self.wfile.write(json.dumps(final_list).encode("utf-8"))
            return

        # API: Get list of all episodes
        if request_path == "/api/episodes":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            
            episodes = []
            files = [f for f in os.listdir(".") if f.startswith("episode_") and f.endswith(".json")]
            for f in files:
                try:
                    with open(f, "r", encoding="utf-8") as file:
                        data = json.load(file)
                        ep_num = data.get("episode_number", 0)
                        panels_dir = f"episode_{ep_num}_panels"
                        frames = data.get("frames", []) if isinstance(data.get("frames"), list) else []
                        frame_numbers = [
                            int(frame.get("frame_number") or idx + 1)
                            for idx, frame in enumerate(frames)
                            if isinstance(frame, dict)
                        ]
                        if not frame_numbers:
                            frame_numbers = list(range(1, parse_frame_count(data.get("frame_count")) + 1))
                        
                        # Add image status for panels
                        images = []
                        for i in frame_numbers:
                            img_relative_path = f"{panels_dir}/panel_{i}.png"
                            img_absolute_path = os.path.join(".", img_relative_path)
                            exists = os.path.exists(img_absolute_path)
                            images.append({
                                "frame": i,
                                "path": f"/{img_relative_path}" if exists else None,
                                "exists": exists
                            })
                        data["frame_count"] = len(frame_numbers)
                        data["images"] = images
                        episodes.append(data)
                except Exception as e:
                    print(f"Error reading {f}: {e}")
            
            # Sort episodes by number ascending
            episodes.sort(key=lambda x: x.get("episode_number", 0))
            self.wfile.write(json.dumps(episodes).encode("utf-8"))
            return

        # API: Get list of all assets (characters, objects, settings)
        if request_path == "/api/assets":
            try:
                from series_db import rebuild_database_from_files
                rebuild_database_from_files()
            except Exception as e:
                print(f"Error rebuilding series database: {e}")
            config_data = decorate_asset_images(load_series_config())
            send_json(self, 200, config_data)
            return

        # API: Get the structured active-series database
        if request_path == "/api/database":
            try:
                from series_db import load_database
                send_json(self, 200, load_database(rebuild=True))
            except Exception as e:
                send_json(self, 500, {"error": str(e)})
            return

        # API: Suggest @mention targets for the episode prompt input
        if request_path == "/api/mentions":
            try:
                from series_db import suggest_mentions
                query = query_params.get("q", [""])[0]
                send_json(self, 200, {"items": suggest_mentions(query)})
            except Exception as e:
                send_json(self, 500, {"error": str(e), "items": []})
            return

        # API: Get background generation status
        if request_path == "/api/generation_status":
            send_json(self, 200, GENERATION_STATUS)
            return
            
        return super().do_GET()

    def do_POST(self):
        global GENERATION_STATUS
        request_path = urllib.parse.urlparse(self.path).path
        print(f"DEBUG: do_POST received path: '{request_path}'")
        try:
            content_length = int(self.headers.get('Content-Length', '0'))
            post_data = self.rfile.read(content_length).decode('utf-8')
            params = json.loads(post_data) if post_data else {}
        except Exception as e:
            send_json(self, 400, {"error": f"Invalid JSON payload: {e}"})
            return

        # API: Save (Add or Edit) an asset (character, object, setting)
        if request_path == "/api/assets/save":
            asset_type = params.get("type") # "characters" or "objects" or "settings"
            old_name = params.get("old_name") # If editing existing
            name = params.get("name", "").strip()
            description = params.get("description", "").strip()
            image_base64 = params.get("image_base64")
            
            if asset_type not in ASSET_TYPES or not name:
                send_json(self, 400, {"error": "Valid type and name are required"})
                return
                
            config_path = "series_config.json"
            config_data = load_series_config(config_path)
            collection = config_data.get(asset_type)
            
            # Find existing asset or create new
            asset = None
            if old_name:
                for item in collection:
                    if item.get("name") == old_name:
                        asset = item
                        break
            else:
                for item in collection:
                    if item.get("name") == name:
                        asset = item
                        break

            if any(item is not asset and item.get("name") == name for item in collection):
                send_json(self, 409, {"error": f"Asset named '{name}' already exists"})
                return
             
            filename = asset_filename(asset_type, name)
            image_path = f"/{filename}"
            
            if asset is None:
                asset = {
                    "name": name,
                    "description": description,
                    "image_ref_path": image_path
                }
                collection.append(asset)
            else:
                old_filename = clean_local_ref_path(asset.get("image_ref_path"))
                if old_name and old_name != name and old_filename and os.path.exists(old_filename) and old_filename != filename:
                    try:
                        if os.path.exists(filename):
                            os.remove(filename)
                        os.rename(old_filename, filename)
                    except Exception as e:
                        print(f"Error renaming image file: {e}")
                        image_path = f"/{old_filename}"
                        
                asset["name"] = name
                asset["description"] = description
                asset["image_ref_path"] = image_path
                
            # If base64 image data is provided, save it
            if image_base64:
                try:
                    import base64
                    if "," in image_base64:
                        image_base64 = image_base64.split(",", 1)[1]
                    img_data = base64.b64decode(image_base64)
                    with open(filename, "wb") as f:
                        f.write(img_data)
                    print(f"Saved asset reference image to: {filename}")
                    try:
                        from comic_engine import clean_reference_image
                        clean_reference_image(filename)
                    except Exception as e_clean:
                        print(f"Error running clean pass on uploaded asset reference: {e_clean}")
                except Exception as e:
                    send_json(self, 400, {"error": f"Error saving base64 asset image: {e}"})
                    return
            
            # Save updated config
            try:
                config_data, _ = normalize_series_config(config_data)
                with open(config_path, "w", encoding="utf-8") as f:
                    json.dump(config_data, f, ensure_ascii=False, indent=2)
                try:
                    from series_db import rebuild_database_from_files
                    rebuild_database_from_files()
                except Exception as e:
                    print(f"Error rebuilding series database after asset save: {e}")
                send_json(self, 200, {"success": True, "asset": asset})
            except Exception as e:
                send_json(self, 500, {"error": str(e)})
            return

        # API: Delete an asset (character, object, setting)
        if request_path == "/api/assets/delete":
            asset_type = params.get("type")
            name = params.get("name")
            
            if asset_type not in ASSET_TYPES or not name:
                send_json(self, 400, {"error": "Valid type and name are required"})
                return
                
            config_path = "series_config.json"
            if not os.path.exists(config_path):
                send_json(self, 404, {"error": "Config not found"})
                return
                
            try:
                config_data = load_series_config(config_path)
                    
                collection = config_data.get(asset_type, [])
                
                # Find the item and remove it
                removed_item = None
                for item in collection:
                    if item.get("name") == name:
                        removed_item = item
                        collection.remove(item)
                        break
                        
                if removed_item:
                    # Also delete the associated image file from disk
                    local_path = clean_local_ref_path(removed_item.get("image_ref_path"))
                    if os.path.exists(local_path):
                        try:
                            os.remove(local_path)
                            print(f"Deleted asset image file: {local_path}")
                        except Exception as e:
                            print(f"Error deleting image file: {e}")
                            
                    # Write updated config
                    config_data, _ = normalize_series_config(config_data)
                    with open(config_path, "w", encoding="utf-8") as f:
                        json.dump(config_data, f, ensure_ascii=False, indent=2)
                    try:
                        from series_db import rebuild_database_from_files
                        rebuild_database_from_files()
                    except Exception as e:
                        print(f"Error rebuilding series database after asset delete: {e}")
                        
                send_json(self, 200, {"success": True})
            except Exception as e:
                send_json(self, 500, {"error": str(e)})
            return

        # API: Re-run the cleaning pass on an existing asset reference image
        if request_path == "/api/assets/reclean":
            asset_type = params.get("type")
            name = params.get("name", "").strip()

            if not name:
                send_json(self, 400, {"error": "Asset name is required"})
                return

            # Determine the expected filename for this asset
            if asset_type in ASSET_TYPES:
                filename = asset_filename(asset_type, name)
            elif name == "style_ref":
                filename = "style_ref.png"
            else:
                filename = clean_local_ref_path(name)

            if not filename or not os.path.exists(filename):
                send_json(self, 404, {"error": f"Reference image not found: {filename!r}"})
                return

            try:
                from comic_engine import clean_reference_image
                clean_reference_image(filename)
                # After cleaning, the file is saved as .png (possibly renamed)
                cleaned_path = os.path.splitext(filename)[0] + ".png"
                if not os.path.exists(cleaned_path):
                    cleaned_path = filename

                # Return the cleaned image as b64 so the UI can update immediately
                with open(cleaned_path, "rb") as f:
                    img_b64 = __import__("base64").b64encode(f.read()).decode()
                send_json(self, 200, {
                    "success": True,
                    "image_data_url": f"data:image/png;base64,{img_b64}",
                    "filename": cleaned_path
                })
            except Exception as e:
                import traceback
                traceback.print_exc()
                send_json(self, 500, {"error": str(e)})
            return

        # API: Save Series Harness configurations
        if request_path == "/api/series/save_harness":
            series_title = params.get("series_title", "").strip()
            series_plot = params.get("series_plot", "").strip()
            style_lock = params.get("style_lock", "").strip()
            master_style_suffix = params.get("master_style_suffix", "").strip()
            comic_language = normalize_comic_language(params.get("comic_language"))
            style_ref_base64 = params.get("style_ref_base64")
            
            config_path = "series_config.json"
            config_data = load_series_config(config_path)
            
            config_data["series_title"] = series_title
            config_data["series_plot"] = series_plot
            config_data["style_lock"] = style_lock
            config_data["master_style_suffix"] = master_style_suffix
            config_data["comic_language"] = comic_language
            
            if style_ref_base64:
                try:
                    import base64
                    if "," in style_ref_base64:
                        style_ref_base64 = style_ref_base64.split(",", 1)[1]
                    img_data = base64.b64decode(style_ref_base64)
                    filename = "style_ref.png"
                    with open(filename, "wb") as f:
                        f.write(img_data)
                    config_data["style_reference_path"] = f"/{filename}"
                    print(f"Saved series style reference image to: {filename}")
                    try:
                        from comic_engine import clean_reference_image
                        clean_reference_image(filename)
                    except Exception as e_clean:
                        print(f"Error running clean pass on style reference: {e_clean}")
                except Exception as e:
                    send_json(self, 400, {"error": f"Error saving base64 style reference: {e}"})
                    return
            
            try:
                config_data, _ = normalize_series_config(config_data)
                with open(config_path, "w", encoding="utf-8") as f:
                    json.dump(config_data, f, ensure_ascii=False, indent=2)
                try:
                    from series_db import rebuild_database_from_files
                    rebuild_database_from_files()
                except Exception as e:
                    print(f"Error rebuilding database: {e}")
                
                config_data = decorate_asset_images(config_data)
                send_json(self, 200, {"success": True, "config": config_data})
            except Exception as e:
                send_json(self, 500, {"error": str(e)})
            return

        # API: Auto Deduce Series configurations
        if request_path == "/api/series/auto_deduce":
            series_title = params.get("series_title", "").strip()
            series_plot = params.get("series_plot", "").strip()
            style_ref_base64 = params.get("style_ref_base64")
            
            config_path = "series_config.json"
            config_data = load_series_config(config_path)
            
            config_data["series_title"] = series_title
            config_data["series_plot"] = series_plot
            
            if style_ref_base64:
                try:
                    import base64
                    if "," in style_ref_base64:
                        style_ref_base64 = style_ref_base64.split(",", 1)[1]
                    img_data = base64.b64decode(style_ref_base64)
                    filename = "style_ref.png"
                    with open(filename, "wb") as f:
                        f.write(img_data)
                    config_data["style_reference_path"] = f"/{filename}"
                    print(f"Saved series style reference image to: {filename}")
                except Exception as e:
                    send_json(self, 400, {"error": f"Error saving base64 style reference: {e}"})
                    return
            
            try:
                from comic_engine import ComicEngine
                engine = ComicEngine()
                updated_config = engine.deduce_series_style_and_characters(config_data)
                
                updated_config, _ = normalize_series_config(updated_config)
                with open(config_path, "w", encoding="utf-8") as f:
                    json.dump(updated_config, f, ensure_ascii=False, indent=2)
                try:
                    from series_db import rebuild_database_from_files
                    rebuild_database_from_files()
                except Exception as e:
                    print(f"Error rebuilding database: {e}")
                
                updated_config = decorate_asset_images(updated_config)
                send_json(self, 200, {"success": True, "config": updated_config})
            except Exception as e:
                import traceback
                traceback.print_exc()
                send_json(self, 500, {"error": str(e)})
            return

        # API: Delete an archived series
        if request_path == "/api/delete_series":
            series_id = params.get("series_id", "").strip()
            if not series_id:
                send_json(self, 400, {"error": "Series ID is required"})
                return
            if series_id == "active":
                send_json(self, 400, {"error": "Cannot delete the active series"})
                return
            if not series_id.startswith("archived_series_"):
                send_json(self, 400, {"error": "Only archived series can be deleted"})
                return

            target_dir = os.path.join("archive", series_id)
            if not os.path.isdir(target_dir):
                send_json(self, 404, {"error": "Series not found"})
                return

            try:
                import shutil
                shutil.rmtree(target_dir)
                try:
                    from series_db import rebuild_database_from_files
                    rebuild_database_from_files()
                except Exception as e:
                    print(f"Error rebuilding series database after delete: {e}")
                send_json(self, 200, {"success": True, "deleted_series_id": series_id})
            except Exception as e:
                send_json(self, 500, {"error": str(e)})
            return

        # API: Switch to a different series
        if request_path == "/api/switch_series":
            series_id = params.get("series_id", "").strip()
            if not series_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Series ID is required"}).encode("utf-8"))
                return
            
            if series_id == "active":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "Already active"}).encode("utf-8"))
                return
                
            try:
                # Perform the swap
                import shutil
                from datetime import datetime
                
                archive_dir = os.path.join(".", "archive")
                target_path = os.path.join(archive_dir, series_id)
                if not os.path.exists(target_path) or not os.path.isdir(target_path):
                    self.send_response(404)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Series archive {series_id} not found"}).encode("utf-8"))
                    return
                
                # 1. Archive the current active series
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                new_archive_name = f"archived_series_{timestamp}"
                new_archive_path = os.path.join(archive_dir, new_archive_name)
                os.makedirs(new_archive_path, exist_ok=True)
                active_ref_files = iter_reference_files()
                
                # Move active files in root to new archive
                active_files = [f for f in os.listdir(".") if f.startswith("episode_") and f.endswith(".json")]
                for f in active_files:
                    try:
                        shutil.move(f, os.path.join(new_archive_path, f))
                    except Exception as e:
                        print(f"Error archiving active file {f}: {e}")
                        
                active_dirs = [d for d in os.listdir(".") if os.path.isdir(d) and d.startswith("episode_") and d.endswith("_panels")]
                for d in active_dirs:
                    try:
                        shutil.move(d, os.path.join(new_archive_path, d))
                    except Exception as e:
                        print(f"Error archiving active dir {d}: {e}")
                        
                if os.path.exists("series_config.json"):
                    try:
                        shutil.move("series_config.json", os.path.join(new_archive_path, "series_config.json"))
                    except Exception as e:
                        print(f"Error archiving active config: {e}")

                for f in active_ref_files:
                    if os.path.exists(f):
                        try:
                            shutil.move(f, os.path.join(new_archive_path, f))
                        except Exception as e:
                            print(f"Error archiving active ref image {f}: {e}")
                 
                # 2. Restore chosen series from archive to root
                for f in os.listdir(target_path):
                    src = os.path.join(target_path, f)
                    dst = os.path.join(".", f)
                    try:
                        shutil.move(src, dst)
                    except Exception as e:
                        print(f"Error restoring file {f}: {e}")
                
                # 3. Clean up empty archive folder
                try:
                    os.rmdir(target_path)
                except Exception as e:
                    print(f"Error removing target archive folder: {e}")

                try:
                    from series_db import rebuild_database_from_files
                    rebuild_database_from_files()
                except Exception as e:
                    print(f"Error rebuilding series database after switch: {e}")
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "Successfully switched series"}).encode("utf-8"))
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        # API: Initialize a brand new series
        if request_path == "/api/new_series":
            char_name = params.get("character_name", "").strip()
            frame_count = parse_frame_count(params.get("frame_count"))
            comic_language = normalize_comic_language(params.get("comic_language"))
            if not char_name:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Character name is required"}).encode("utf-8"))
                return
            
            # Helper to decode and save base64 image
            def save_base64_image(base64_str, output_path):
                if not base64_str:
                    return False
                try:
                    import base64
                    if "," in base64_str:
                        base64_str = base64_str.split(",", 1)[1]
                    img_data = base64.b64decode(base64_str)
                    with open(output_path, "wb") as f:
                        f.write(img_data)
                    print(f"Saved base64 image reference to: {output_path}")
                    try:
                        from comic_engine import clean_reference_image
                        clean_reference_image(output_path)
                    except Exception as e_clean:
                        print(f"Error running clean pass on new series reference: {e_clean}")
                    return True
                except Exception as e:
                    print(f"Error saving base64 image: {e}")
                    return False

            try:
                # 1. Archiving logic
                import shutil
                from datetime import datetime
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                archive_dir = os.path.join(".", "archive", f"archived_series_{timestamp}")
                os.makedirs(archive_dir, exist_ok=True)
                active_ref_files = iter_reference_files()
                
                # Move episode JSON files
                files = [f for f in os.listdir(".") if f.startswith("episode_") and f.endswith(".json")]
                for f in files:
                    try:
                        shutil.move(f, os.path.join(archive_dir, f))
                    except Exception as e:
                        print(f"Error moving file {f} to archive: {e}")
                        
                # Move episode panels folders
                dirs = [d for d in os.listdir(".") if os.path.isdir(d) and d.startswith("episode_") and d.endswith("_panels")]
                for d in dirs:
                    try:
                        shutil.move(d, os.path.join(archive_dir, d))
                    except Exception as e:
                        print(f"Error moving directory {d} to archive: {e}")
                
                # Move old series_config.json if exists
                if os.path.exists("series_config.json"):
                    try:
                        shutil.move("series_config.json", os.path.join(archive_dir, "series_config.json"))
                    except Exception:
                        pass
                
                # Archive all active reference files so each series swaps cleanly.
                for f in active_ref_files:
                    if os.path.exists(f):
                        try:
                            shutil.move(f, os.path.join(archive_dir, f))
                        except Exception as e:
                            print(f"Error archiving ref image {f}: {e}")
                
                # 2. Save new uploaded reference images in root (before Gemini/swapper runs)
                char_ref = params.get("character_ref")
                if char_ref:
                    save_base64_image(char_ref, asset_filename("characters", char_name))
                
                setting_ref = params.get("setting_ref")
                if setting_ref:
                    save_base64_image(setting_ref, "setting_ref.png")

                # 3. Call ComicEngine to initialize new series
                from comic_engine import ComicEngine, save_episode, generate_panels_for_episode, prepare_episode_payload_for_generation
                
                params["comic_language"] = comic_language
                engine = ComicEngine()
                payload = engine.create_new_series(params)
                
                # Save series_config.json
                series_config = payload.get("series_config", {})
                series_config["comic_language"] = comic_language
                
                # Force user's custom inputs directly
                char_name = params.get("character_name", "").strip()
                char_desc = params.get("character_desc", "").strip()
                setting_desc = params.get("setting_desc", "").strip()
                
                if char_name:
                    series_config["protagonist_name"] = char_name
                if char_desc:
                    series_config["protagonist_description"] = char_desc
                if setting_desc:
                    series_config["setting_description"] = setting_desc
                
                # Ensure characters list matches user inputs
                characters = series_config.get("characters", [])
                if not characters:
                    characters = [{"name": char_name or "Protagonist", "description": char_desc}]
                else:
                    characters[0]["name"] = char_name or characters[0].get("name", "Protagonist")
                    characters[0]["description"] = char_desc or characters[0].get("description", "")
                series_config["characters"] = characters
                
                # Ensure settings list matches user inputs
                settings = series_config.get("settings", [])
                if not settings:
                    settings = [{"name": "Bối Cảnh Chính", "description": setting_desc}]
                else:
                    settings[0]["name"] = "Bối Cảnh Chính"
                    settings[0]["description"] = setting_desc or settings[0].get("description", "")
                series_config["settings"] = settings

                series_config, _ = normalize_series_config(series_config)
                series_config["series_title"] = params.get("title", "").strip() or series_config.get("series_title", "").strip()
                series_config["series_plot"] = params.get("plot", "").strip() or series_config.get("series_plot", "").strip()
                series_config["style_lock"] = series_config.get("style_lock", "").strip()
                
                if char_ref and series_config.get("characters"):
                    series_config["characters"][0]["image_ref_path"] = f"/{asset_filename('characters', series_config['characters'][0]['name'])}"
                if setting_ref and series_config.get("settings"):
                    series_config["settings"][0]["image_ref_path"] = "/setting_ref.png"
                    try:
                        import shutil
                        if os.path.exists("setting_ref.png"):
                            shutil.copy("setting_ref.png", "style_ref.png")
                            series_config["style_reference_path"] = "/style_ref.png"
                    except Exception as e_copy:
                        print(f"Error copying setting_ref to style_ref: {e_copy}")
                
                series_config, _ = normalize_series_config(series_config)
                with open("series_config.json", "w", encoding="utf-8") as f:
                    json.dump(series_config, f, ensure_ascii=False, indent=2)
                print(f"Saved new series configuration to series_config.json")
                
                # Save episode 1 payload
                episode_payload = payload.get("episode", {})
                episode_payload["episode_number"] = 1
                episode_payload["frame_count"] = frame_count
                episode_payload["comic_language"] = comic_language
                episode_payload["topic"] = params.get("plot", "").strip() or params.get("title", "").strip()
                episode_payload["prompt_text"] = episode_payload["topic"]
                episode_payload = prepare_episode_payload_for_generation(episode_payload)
                save_episode(episode_payload)
                try:
                    from series_db import rebuild_database_from_files
                    rebuild_database_from_files()
                except Exception as e:
                    print(f"Error rebuilding series database after new series: {e}")
                
                # Start panel generation for Episode 1 in background thread
                GENERATION_STATUS = {
                    "active": True,
                    "episode_number": 1,
                    "stage": "panel",
                    "current_panel": 0,
                    "total_panels": frame_count,
                    "error": None,
                    "topic": params.get("plot", "").strip() or params.get("title", "").strip() or "Tập đầu tiên"
                }
                save_generation_progress()
                
                def new_series_progress_callback(current, total, done=False):
                    global GENERATION_STATUS
                    if done:
                        GENERATION_STATUS["stage"] = "completed"
                        GENERATION_STATUS["active"] = False
                        GENERATION_STATUS["current_panel"] = total
                    else:
                        GENERATION_STATUS["current_panel"] = current
                    save_generation_progress()
                    
                thread = threading.Thread(target=generate_panels_for_episode, args=(episode_payload, 42691, new_series_progress_callback))
                thread.daemon = True
                thread.start()
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(episode_payload).encode("utf-8"))
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        # API: Generate new episode JSON using the ComicEngine
        if request_path == "/api/generate":
            if GENERATION_STATUS.get("active"):
                send_json(self, 400, {"error": "Another generation is currently in progress."})
                return
                
            topic = params.get("topic", "").strip()
            frame_count = parse_frame_count(params.get("frame_count"))
            
            # The active series config is the single source of truth for the language.
            comic_language = "vn"
            if os.path.exists("series_config.json"):
                try:
                    with open("series_config.json", "r", encoding="utf-8") as f:
                        comic_language = json.load(f).get("comic_language", "vn")
                except Exception:
                    pass
            comic_language = normalize_comic_language(comic_language)
            
            # Find next episode number dynamically and collect existing titles to prevent duplication
            files = [f for f in os.listdir(".") if f.startswith("episode_") and f.endswith(".json")]
            episodes_nums = []
            existing_titles = []
            for f in files:
                try:
                    num = int(f.replace("episode_", "").replace(".json", ""))
                    episodes_nums.append(num)
                    with open(f, "r", encoding="utf-8") as file:
                        data = json.load(file)
                        existing_titles.append(data.get("episode_title", ""))
                except Exception:
                    pass
            next_num = max(episodes_nums) + 1 if episodes_nums else 1
            
            # Initialize background state
            GENERATION_STATUS = {
                "active": True,
                "episode_number": next_num,
                "stage": "started",
                "current_panel": 0,
                "total_panels": frame_count,
                "error": None,
                "topic": topic or "Auto-suggesting topic..."
            }
            save_generation_progress()
            
            # Spawn background generation thread
            thread = threading.Thread(
                target=run_generation_task, 
                args=(topic, next_num, frame_count, comic_language, existing_titles)
            )
            thread.daemon = True
            thread.start()
            
            send_json(self, 200, {"success": True, "episode_number": next_num})
            return

        # API: Publish a specific episode to Facebook Page
        elif request_path == "/api/publish":
            ep_num = params.get("episode_number")
            if ep_num is None:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Episode number is required")
                return

            print(f"Web Dashboard: Triggering Facebook publish for Episode {ep_num}...")
            try:
                # Execute publish_carousel.py via subprocess to run in isolation
                # We also inherit environmental variables to keep PYTHONIOENCODING and tokens
                env = os.environ.copy()
                env["PYTHONIOENCODING"] = "utf-8"
                
                result = subprocess.run(
                    ["python", "publish_carousel.py", str(ep_num)], 
                    capture_output=True, 
                    text=True, 
                    encoding="utf-8",
                    env=env
                )
                
                # Check output for indicators
                stdout = result.stdout
                stderr = result.stderr
                success = "Success!" in stdout or result.returncode == 0
                
                self.send_response(200 if success else 400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                
                response_payload = {
                    "success": success,
                    "stdout": stdout,
                    "stderr": stderr
                }
                self.wfile.write(json.dumps(response_payload).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

def run_server():
    import time
    # Force CWD to the directory of app.py to prevent directory listing exposure of the home directory
    app_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(app_dir)
    print(f"Server working directory set to: {app_dir}")
    
    try:
        from series_db import rebuild_database_from_files
        rebuild_database_from_files()
    except Exception as e:
        print(f"Error rebuilding series database on startup: {e}")

    load_generation_progress()

    while True:
        try:
            with ThreadedTCPServer(("", PORT), DashboardHandler) as httpd:
                print(f"\n=======================================================")
                print(f"COMIC SERIES DASHBOARD STARTED")
                print(f"Local URL: http://localhost:{PORT}")
                print(f"=======================================================\n")
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
    run_server()
