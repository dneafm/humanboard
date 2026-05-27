import os
import json
import re
import unicodedata
import config
from google import genai
from venice_helper import VeniceHelper
from recraft_helper import RecraftHelper

# Try to import Face2Face for character consistency face-swapping
try:
    from face2face import Face2Face
    F2F_AVAILABLE = True
except ImportError:
    F2F_AVAILABLE = False


SYSTEM_PROMPT = """
# SYSTEM PROMPT: SERIES-NEUTRAL 4-FRAME COMIC CONTENT ENGINE

## 1. CORE ROLE
You are a Lead Storyteller and visual prompt designer for the currently active series. The active series is defined only by the injected `# ACTIVE SERIES ASSETS & LORE` block and by the user's episode topic.

Do not assume any legacy brand, protagonist, setting, genre, occupation, tutorial type, philosophy, or visual motif unless it appears in the active series assets/lore or in the user's topic.
If recent episode records conflict with the active characters/assets/settings, ignore the conflicting older details.

## 2. STORY STRUCTURE
For every request, output exactly 4 frames. Together they should form a satisfying mini-episode for the active series.

Use these panel roles unless the user's topic clearly implies better labels:
- Frame 1: Hook / Situation
- Frame 2: Action / Complication
- Frame 3: Insight / Turning Point
- Frame 4: Result / Emotional Beat

## 3. VISUAL CONSISTENCY
- If a named character appears, copy that character's exact lore description into the image_generation_prompt.
- If a named object, prop, or setting appears, copy its exact lore description into the image_generation_prompt.
- Every image_generation_prompt must end with the exact Master Style Suffix from the lore block.
- Keep camera, lighting, environment, clothing, and mood faithful to the active series. Do not import unrelated environments or occupations from previous series.

## 4. OVERLAY RULES
- Include BOTH `text_overlay_vietnamese` and `text_overlays` for every frame.
- `text_overlays` items may only use type `"narration"` or `"dialogue"`.
- Keep each overlay short: ideally 4-7 words, maximum 8-10 words.
- Dialogue bubbles must be positioned near the speaking character: left-side speakers use `top-left` or `bottom-left`; right-side speakers use `top-right` or `bottom-right`.

## 5. OUTPUT FORMAT
Return only a valid JSON object with this structure:
{
  "episode_number": 0,
  "episode_title": "Vietnamese title",
  "tutorial_summary": "One Vietnamese sentence summarizing the episode or takeaway",
  "materials_list": [],
  "frames": [
    {
      "frame_number": 1,
      "panel_type": "Hook / Situation",
      "text_overlay_vietnamese": "Short Vietnamese overlay fallback",
      "text_overlays": [
        { "type": "narration", "text": "Short Vietnamese text", "position": "top-left" }
      ],
      "image_generation_prompt": "English visual prompt ending with Master Style Suffix"
    }
  ],
  "caption_post": "Vietnamese Facebook caption, 3-5 sentences, ending with 5-7 relevant hashtags."
}
"""

DEFAULT_STYLE_SUFFIX = "[, high-quality graphic novel illustration, crisp ink outlines, clean cel-shading, richly detailed background, hand-drawn digital art, coherent character design, masterfully composed, 8k resolution --ar 4:3]"


def asset_slug(name):
    normalized = unicodedata.normalize("NFC", (name or "").strip().lower())
    return re.sub(r"[^\w.-]+", "_", normalized, flags=re.UNICODE).strip("._") or "asset"


def clean_local_ref_path(ref_path):
    if not ref_path:
        return ""
    return os.path.basename(str(ref_path).split("?", 1)[0].lstrip("/\\"))


def _asset_lines(items, fallback="None defined yet."):
    lines = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        description = str(item.get("description") or "").strip()
        if name or description:
            lines.append(f"- **{name or 'Unnamed'}**: {description}")
    return "\n".join(lines) if lines else fallback


def build_lore_prompt_block(config_data):
    if not isinstance(config_data, dict) or not config_data:
        return ""

    protagonist_name = str(config_data.get("protagonist_name") or "Protagonist").strip()
    protagonist_description = str(config_data.get("protagonist_description") or "").strip()
    setting_description = str(config_data.get("setting_description") or "").strip()
    master_style_suffix = str(config_data.get("master_style_suffix") or DEFAULT_STYLE_SUFFIX).strip()

    characters = config_data.get("characters") or []
    if not characters and (protagonist_name or protagonist_description):
        characters = [{"name": protagonist_name, "description": protagonist_description}]

    settings = config_data.get("settings") or []
    if not settings and setting_description:
        settings = [{"name": "Bối Cảnh Chính", "description": setting_description}]

    return f"""# ACTIVE SERIES ASSETS & LORE
Use this series database as the source of truth for all story planning, visual continuity, and image prompts.

## Characters
{_asset_lines(characters)}

## Consistent Objects / Props
{_asset_lines(config_data.get("objects") or [])}

## Settings / Locations
{_asset_lines(settings)}

## Master Style Suffix
{master_style_suffix}

## Consistency Rules
1. If a frame includes a named character, copy that character's exact visual description into the image prompt.
2. If a frame includes a named object or location, copy the exact asset/location description into the image prompt.
3. Every frame's image_generation_prompt must end with the exact Master Style Suffix above.
4. Keep overlays short and use only "dialogue" or "narration" types.
"""


def load_lore_prompt_block(config_path="series_config.json"):
    if not os.path.exists(config_path):
        return ""
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return build_lore_prompt_block(json.load(f))
    except Exception as e:
        print(f"Error loading series lore config: {e}")
        return ""


def load_database_prompt_block(topic=""):
    try:
        from series_db import build_generation_context
        return build_generation_context(topic)
    except Exception as e:
        print(f"Error loading series database context: {e}")
        return load_lore_prompt_block()


def scrub_legacy_bias(value, source_text="", protagonist_name=""):
    """Remove old-project language from newly initialized series payloads unless the user asked for it."""
    if isinstance(value, dict):
        return {key: scrub_legacy_bias(item, source_text, protagonist_name) for key, item in value.items()}
    if isinstance(value, list):
        return [scrub_legacy_bias(item, source_text, protagonist_name) for item in value]
    if not isinstance(value, str):
        return value

    replacements = [
        ("The Cyber Homestead", "the active series"),
        ("Cyber Homestead", "the active series"),
        ("cyber-homesteading", "active-series"),
        ("cyber homesteading", "active series"),
        ("homesteading", "active setting"),
        ("homestead", "active setting"),
        ("Studio Ghibli", "detailed graphic novel"),
        ("Ghibli", "detailed graphic novel"),
        ("solarpunk", "graphic novel"),
        ("smart contract", "personal"),
        ("developer", "protagonist"),
        ("debug", "solve"),
        ("Leo", protagonist_name or "the protagonist"),
    ]

    result = value
    source_lower = source_text.casefold()
    for needle, replacement in replacements:
        if needle.casefold() not in source_lower:
            result = re.sub(re.escape(needle), replacement, result, flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", result).strip()


class ComicEngine:
    def __init__(self):
        if not config.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is missing from .env file!")
        self.client = genai.Client()

    def suggest_next_topic(self, existing_titles: list) -> str:
        """
        Asks Gemini to suggest a single next topic for the active series.
        """
        titles_str = ", ".join(existing_titles) if existing_titles else "none"
        lore_block = load_database_prompt_block()
        prompt = (
            f"{lore_block}\n\n"
            f"Avoid these existing topics: {titles_str}.\n"
            "Suggest exactly one new, highly engaging topic for the active series. "
            "Do not reuse any legacy character, setting, genre, occupation, visual motif, or theme not present in the active series lore.\n"
            "Return ONLY the topic title, with a brief Vietnamese explanation in parentheses. "
            "Do not include any other text or markdown formatting."
        )
        models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite']
        import time
        for model_name in models:
            try:
                print(f"Asking Gemini ({model_name}) to suggest next topic...")
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                topic = response.text.strip().strip('"').strip("'")
                if topic:
                    return topic
            except Exception as e:
                print(f"Failed to suggest topic using {model_name}: {e}")
                if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                    print("Rate limit reached. Sleeping 6 seconds...")
                    time.sleep(6)
        
        return "Khoảnh khắc tiếp theo (Next story beat)"

    def generate_episode(self, topic: str, episode_num: int = 1, database_context: str = "") -> dict:
        """
        Calls Gemini to generate the structured comic JSON payload for a given topic.
        """
        print(f"Generating comic payload for topic: '{topic}'...")
        
        series_title = "the active series"
        if os.path.exists("series_config.json"):
            try:
                with open("series_config.json", "r", encoding="utf-8") as f:
                    series_title = json.load(f).get("series_title") or series_title
            except Exception:
                pass

        prompt = (
            f"Please generate Episode {episode_num} of '{series_title}'.\n"
            f"User topic/source prompt: {topic}\n"
            "Resolve any @ references from the ACTIVE SERIES DATABASE. "
            "Use only the current series database and this user prompt as story context."
        )
        
        lore_block = database_context or load_database_prompt_block(topic)
        sys_prompt = f"{lore_block}\n\n{SYSTEM_PROMPT}" if lore_block else SYSTEM_PROMPT
        if lore_block:
            print("Loaded active series database context into Gemini prompt.")
        
        models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite']
        import time
        last_err = None
        for model_name in models:
            try:
                print(f"Attempting comic generation using ({model_name})...")
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={
                        "system_instruction": sys_prompt,
                        "response_mime_type": "application/json"
                    }
                )
                payload = json.loads(response.text.strip())
                payload["episode_number"] = episode_num
                return payload
            except Exception as e:
                print(f"Failed to generate episode using {model_name}: {e}")
                last_err = e
                if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                    print("Rate limit reached. Sleeping 6 seconds...")
                    time.sleep(6)
        
        raise last_err

    def create_new_series(self, data: dict) -> dict:
        """
        Initializes a new comic series based on structured user input describing theme/protagonist.
        Returns a dictionary with both 'series_config' and 'episode' (Episode 1).
        """
        title = data.get("title", "").strip() or "Untitled Series"
        plot = data.get("plot", "").strip() or "A character-led 4-frame visual story series"
        char_name = data.get("character_name", "").strip() or "Protagonist"
        char_desc = data.get("character_desc", "").strip() or f"{char_name}, described by the active series premise"
        setting_desc = data.get("setting_desc", "").strip() or "A setting defined by the active series premise"

        print(f"Initializing new series '{title}' for protagonist '{char_name}'...")
        
        prompt = (
            f"Please initialize a brand new comic series. Here are the user's structured inputs:\n"
            f"- Series Title: {title}\n"
            f"- Plot / Intro: {plot}\n"
            f"- Protagonist Name: {char_name}\n"
            f"- Protagonist Visual Description: {char_desc}\n"
            f"- Setting Description: {setting_desc}\n\n"
            f"Generate both the series_config metadata and Episode 1 (introductory episode) details."
        )
        
        system_instruction = """
You are a Lead Storyteller and visual continuity designer. Your job is to initialize a new 4-frame comic series based only on the user's prompt describing the title, plot, setting, theme, and protagonist.

ANTI-BIAS RULES:
- Do not reuse any protagonist, setting, object, occupation, genre, tone, visual motif, or plot mechanic from a previous series.
- Do not reuse any legacy series names, protagonists, settings, tutorial formats, occupations, genres, visual motifs, or emotional themes unless the user explicitly requested them.
- Never default to old project concepts, legacy names, legacy art styles, or prior tutorial formats unless those exact ideas are present in the user's new series input.
- If the user does not name a specific visual style, use a neutral high-quality graphic novel style derived from the new character and setting only.
- Treat the user's structured inputs below as the complete source of truth.

You must generate:
1. The configuration for this series (protagonist name, detailed visual description, setting, master style suffix, and structured lore arrays for characters, objects, and settings).
2. Episode 1 (Intro/Setup) of this new series, matching the requested plot and setting.

CRITICAL OVERLAY RULES:
- The overlay `type` field must strictly be one of: "narration" or "dialogue". "thought" and "shout" are NOT allowed.
- Speech Bubble Pointer Alignment Rule: Dialogue bubbles must have their pointer tails pointing toward the speaking character. To ensure this, you must position the bubble near the speaker's described location in the image.
  - For example, if a character is on the left side of the panel, their dialogue bubble position should be `top-left` or `bottom-left`.
  - If a character is on the right side of the panel, their dialogue bubble position should be `top-right` or `bottom-right`.

Strictly return a JSON object with this exact structure:
{
  "series_config": {
    "series_title": "Exact series title from the user's input",
    "protagonist_name": "Name of protagonist (single word or simple name)",
    "protagonist_description": "Detailed reusable visual description of the protagonist based only on the user input",
    "setting_description": "Brief reusable description of the setting, atmosphere, palette, and mood based only on the user input",
    "master_style_suffix": "Master style suffix to append to image prompts, derived from the requested series style and setting",
    "characters": [
      {
        "name": "Name",
        "description": "Exact reusable visual prompt description for this character",
        "image_ref_path": "/name_face.png"
      }
    ],
    "objects": [
      {
        "name": "Consistent object or prop name",
        "description": "Exact reusable visual prompt description for a consistent object/prop",
        "image_ref_path": "/object_ref.png"
      }
    ],
    "settings": [
      {
        "name": "Bối Cảnh Chính",
        "description": "Exact reusable setting/location prompt description",
        "image_ref_path": "/setting_ref.png"
      }
    ]
  },
  "episode": {
    "episode_number": 1,
    "episode_title": "String — Vietnamese title of the introductory episode",
    "tutorial_summary": "One sentence in Vietnamese summarizing the episode or takeaway",
    "materials_list": [],
    "frames": [
      {
        "frame_number": 1,
        "panel_type": "Hook / Situation",
        "text_overlay_vietnamese": "Một khoảnh khắc mở đầu ngắn.",
        "text_overlays": [
          { "type": "narration", "text": "Mở đầu câu chuyện.", "position": "top-left" },
          { "type": "dialogue", "character": "Name", "text": "Một câu thoại ngắn.", "position": "bottom-right" }
        ],
        "image_generation_prompt": "English description introducing the protagonist and setting + Master Style Suffix"
      },
      {
        "frame_number": 2,
        "panel_type": "Action / Complication",
        "text_overlay_vietnamese": "Một hành động hoặc xung đột ngắn.",
        "text_overlays": [
          { "type": "narration", "text": "Biến cố bắt đầu.", "position": "top-left" },
          { "type": "dialogue", "character": "Name", "text": "Một câu thoại ngắn.", "position": "bottom-right" }
        ],
        "image_generation_prompt": "English description of the action or complication + Master Style Suffix"
      },
      {
        "frame_number": 3,
        "panel_type": "Insight / Turning Point",
        "text_overlay_vietnamese": "Một bước ngoặt hoặc nhận ra.",
        "text_overlays": [
          { "type": "narration", "text": "Bước ngoặt xuất hiện.", "position": "top-left" },
          { "type": "dialogue", "character": "Name", "text": "Một câu thoại ngắn.", "position": "bottom-right" }
        ],
        "image_generation_prompt": "English description of the insight or turning point + Master Style Suffix"
      },
      {
        "frame_number": 4,
        "panel_type": "Result / Emotional Beat",
        "text_overlay_vietnamese": "Một kết thúc giàu cảm xúc.",
        "text_overlays": [
          { "type": "narration", "text": "Khoảnh khắc khép lại.", "position": "top-left" },
          { "type": "dialogue", "character": "Name", "text": "Một câu thoại ngắn.", "position": "bottom-right" }
        ],
        "image_generation_prompt": "English description of the final emotional/result beat + Master Style Suffix"
      }
    ],
    "caption_post": "Đoạn văn 3-5 câu làm caption Facebook, kể về bối cảnh mới và tập đầu tiên này, cuối có 5-7 hashtag liên quan."
  }
}
"""
        
        models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite']
        import time
        last_err = None
        for model_name in models:
            try:
                print(f"Attempting new series generation using ({model_name})...")
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={
                        "system_instruction": system_instruction,
                        "response_mime_type": "application/json"
                    }
                )
                payload = json.loads(response.text.strip())
                source_text = json.dumps(data, ensure_ascii=False)
                return scrub_legacy_bias(payload, source_text, char_name)
            except Exception as e:
                print(f"Failed to generate new series using {model_name}: {e}")
                last_err = e
                if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                    print("Rate limit reached. Sleeping 6 seconds...")
                    time.sleep(6)
        
        raise last_err


def get_primary_character_config(config_path="series_config.json"):
    if not os.path.exists(config_path):
        return {}
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = json.load(f)
    except Exception as e:
        print(f"Error loading series config for character reference: {e}")
        return {}

    characters = config_data.get("characters") or []
    if characters and isinstance(characters[0], dict):
        primary = characters[0]
    else:
        primary = {
            "name": config_data.get("protagonist_name", ""),
            "description": config_data.get("protagonist_description", ""),
        }

    name = str(primary.get("name") or config_data.get("protagonist_name") or "").strip()
    ref_path = clean_local_ref_path(primary.get("image_ref_path"))
    if not ref_path and name:
        ref_path = f"{asset_slug(name)}_face.png"

    return {
        "name": name,
        "description": str(primary.get("description") or "").strip(),
        "ref_path": ref_path,
    }


def frame_mentions_character(frame, character_name):
    if not character_name:
        return False
    haystack = json.dumps(frame, ensure_ascii=False).lower()
    return character_name.lower() in haystack


def generate_panels_for_episode(payload: dict, character_seed: int = 42691):
    """
    Generates images for all 4 panels using the selected image generator with full controls.
    
    Args:
        payload:   The episode JSON payload from Gemini.
        character_seed: Fixed seed used for frames where the active protagonist
                        appears, helping character consistency.
    """
    ep_num = payload.get("episode_number", 1)
    panels_dir = f"episode_{ep_num}_panels"
    os.makedirs(panels_dir, exist_ok=True)

    # Initialize the selected generator backend
    if getattr(config, "IMAGE_GENERATOR_BACKEND", "recraft") == "recraft":
        image_generator = RecraftHelper()
        backend_name = "Recraft V4.1"
    else:
        image_generator = VeniceHelper()
        backend_name = "Venice AI"

    primary_character = get_primary_character_config()
    protagonist_name = primary_character.get("name", "")
    ref_face = primary_character.get("ref_path", "")

    for i, frame in enumerate(payload.get("frames", [])):
        prompt = frame.get("image_generation_prompt", "")
        frame_num = frame.get("frame_number", i + 1)
        filename = os.path.join(panels_dir, f"panel_{frame_num}.png")

        # Skip already-generated panels to prevent double billing
        if os.path.exists(filename):
            print(f"Panel {frame_num} already exists, skipping generation.")
            continue

        character_visible = frame_mentions_character(frame, protagonist_name)
        seed = character_seed if character_visible else -1
        seed_label = f"seed={seed}" if seed >= 0 else "random seed"
        print(f"Generating panel {frame_num}/{len(payload.get('frames', []))} using {backend_name} ({seed_label})...")

        try:
            image_bytes = image_generator.generate_image(prompt, aspect_ratio="4:3", seed=seed)
            with open(filename, "wb") as f:
                f.write(image_bytes)
            print(f"✅ Saved {filename}")
            
            # Optional post-processing: face swap only when a user/series reference exists.
            if character_visible and ref_face:
                if F2F_AVAILABLE:
                    try:
                        if os.path.exists(ref_face):
                            print(f"Applying Face2Face swap to panel {frame_num} using {ref_face}...")
                            f2f = Face2Face()
                            swapped_img = f2f.swap_img_to_img(ref_face, filename)
                            import cv2
                            cv2.imwrite(filename, swapped_img)
                            print(f"✅ Successfully face-swapped panel {frame_num} and saved to {filename}")
                        else:
                            print(f"⚠️ Reference face file {ref_face} not found. Skipping face swap.")
                    except Exception as e:
                        print(f"⚠️ Face2Face swap failed for panel {frame_num}: {e}. Keeping raw generated panel.")
                else:
                    print(f"ℹ️ Face2Face not available. Skipping face swap for panel {frame_num}.")
                    
        except Exception as e:
            print(f"❌ Failed to generate panel {frame_num}: {e}")

def save_episode(payload: dict):
    """Saves the episode JSON to a file."""
    ep_num = payload.get("episode_number", 0)
    filename = f"episode_{ep_num}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"✅ Saved episode metadata to: {os.path.abspath(filename)}")

if __name__ == "__main__":
    import sys
    
    topic = "A quiet turning point for the active series"
    if len(sys.argv) > 1:
        topic = sys.argv[1]
        
    try:
        engine = ComicEngine()
        payload = engine.generate_episode(topic, episode_num=1)
        print("\n--- Generated Episode Payload ---")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        save_episode(payload)
        
        # Automatically trigger Venice AI generation for all 4 panels!
        print("\n--- Generating Panels via Venice AI (Flux 2 Max) ---")
        generate_panels_for_episode(payload)
        
    except Exception as e:
        print(f"Failed to run Content Engine: {e}")
