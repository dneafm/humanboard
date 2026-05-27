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
DEFAULT_STYLE_SUFFIX = "[, high-quality graphic novel illustration, crisp ink outlines, clean cel-shading, richly detailed background, hand-drawn digital art, coherent character design, masterfully composed, 8k resolution --ar 4:3]"


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

    for filename in os.listdir("."):
        if os.path.isfile(filename) and (filename.endswith("_face.png") or filename.endswith("_ref.png") or filename == "setting_ref.png"):
            refs.add(filename)
    return sorted(refs)


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

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
                        
                        # Add image status for panels
                        images = []
                        for i in range(1, 5):
                            img_relative_path = f"{panels_dir}/panel_{i}.png"
                            img_absolute_path = os.path.join(".", img_relative_path)
                            exists = os.path.exists(img_absolute_path)
                            images.append({
                                "frame": i,
                                "path": f"/{img_relative_path}" if exists else None,
                                "exists": exists
                            })
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
            
        return super().do_GET()

    def do_POST(self):
        request_path = urllib.parse.urlparse(self.path).path
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
                from comic_engine import ComicEngine, save_episode, generate_panels_for_episode
                import threading
                
                engine = ComicEngine()
                payload = engine.create_new_series(params)
                
                # Save series_config.json
                series_config, _ = normalize_series_config(payload.get("series_config", {}))
                series_config["series_title"] = series_config.get("series_title") or params.get("title", "").strip()
                series_config["series_plot"] = series_config.get("series_plot") or params.get("plot", "").strip()
                if char_ref and series_config.get("characters"):
                    series_config["characters"][0]["image_ref_path"] = f"/{asset_filename('characters', series_config['characters'][0]['name'])}"
                if setting_ref and series_config.get("settings"):
                    series_config["settings"][0]["image_ref_path"] = "/setting_ref.png"
                series_config, _ = normalize_series_config(series_config)
                with open("series_config.json", "w", encoding="utf-8") as f:
                    json.dump(series_config, f, ensure_ascii=False, indent=2)
                print(f"Saved new series configuration to series_config.json")
                
                # Save episode 1 payload
                episode_payload = payload.get("episode", {})
                episode_payload["episode_number"] = 1
                episode_payload["topic"] = params.get("plot", "").strip() or params.get("title", "").strip()
                episode_payload["prompt_text"] = episode_payload["topic"]
                save_episode(episode_payload)
                try:
                    from series_db import rebuild_database_from_files
                    rebuild_database_from_files()
                except Exception as e:
                    print(f"Error rebuilding series database after new series: {e}")
                
                # Start panel generation for Episode 1 in background thread
                thread = threading.Thread(target=generate_panels_for_episode, args=(episode_payload,))
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
            topic = params.get("topic", "").strip()
            
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
            
            try:
                from comic_engine import ComicEngine, save_episode, generate_panels_for_episode
                from series_db import active_series, build_generation_context, load_database, record_episode_payload
                import threading

                db = load_database(rebuild=True)
                series = active_series(db)
                if series.get("protagonist_name"):
                    existing_titles = [
                        episode.get("title", "")
                        for episode in db.get("episodes", [])
                        if episode.get("mentions_primary_character") and episode.get("title")
                    ]
                
                engine = ComicEngine()
                
                if not topic:
                    print("Web Dashboard: Topic is empty. Asking Gemini to auto-suggest a topic...")
                    topic = engine.suggest_next_topic(existing_titles)
                    print(f"Web Dashboard: Auto-suggested topic -> '{topic}'")
                
                print(f"Web Dashboard: Triggering generation for Episode {next_num} -> Topic: '{topic}'")
                
                database_context = build_generation_context(topic)
                payload = engine.generate_episode(topic, episode_num=next_num, database_context=database_context)
                payload["topic"] = topic
                payload["prompt_text"] = topic
                save_episode(payload)
                record_episode_payload(payload, topic)
                
                # Run the panel image generation in a background thread to prevent UI timeout
                thread = threading.Thread(target=generate_panels_for_episode, args=(payload,))
                thread.daemon = True
                thread.start()
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
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
    try:
        from series_db import rebuild_database_from_files
        rebuild_database_from_files()
    except Exception as e:
        print(f"Error rebuilding series database on startup: {e}")

    with ThreadedTCPServer(("", PORT), DashboardHandler) as httpd:
        print(f"\n=======================================================")
        print(f"COMIC SERIES DASHBOARD STARTED")
        print(f"Local URL: http://localhost:{PORT}")
        print(f"=======================================================\n")
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()
