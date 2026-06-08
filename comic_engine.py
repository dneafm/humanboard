import os
import json
import re
import time
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
# SYSTEM PROMPT: SERIES-NEUTRAL COMIC CONTENT ENGINE

## 1. CORE ROLE
You are a Lead Storyteller and visual prompt designer for the currently active series. The active series is defined only by the injected `# ACTIVE SERIES ASSETS & LORE` block and by the user's episode topic.

Do not assume any legacy brand, protagonist, setting, genre, occupation, tutorial type, philosophy, or visual motif unless it appears in the active series assets/lore or in the user's topic.
If recent episode records conflict with the active characters/assets/settings, ignore the conflicting older details.

## 2. STORY STRUCTURE
For every request, output exactly the requested number of frames. Together they should form a satisfying mini-episode for the active series.

Use these panel roles unless the user's topic clearly implies better labels:
- Frame 1: Hook / Situation
- Frame 2: Action / Complication
- Frame 3: Insight / Turning Point
- Final Frame: Result / Emotional Beat, and if the episode has enough frames, a broader season-arc complication created by the protagonist's resolution.

## 3. VISUAL CONSISTENCY
- If a named character appears, copy that character's exact lore description into the image_generation_prompt.
- Keep each recurring character's face shape, hair, outfit, age, build, and color palette identical across all frames unless the user explicitly requests a costume/story change.
- For group scenes, name every visible character and keep their descriptions separate. Do not blend character traits together.
- Treat the character lore as a canonical model sheet. Do not invent alternate haircuts, outfits, ages, body types, ethnicities, or facial features for recurring characters.
- If a named object, prop, or setting appears, copy its exact lore description into the image_generation_prompt.
- Every image_generation_prompt must end with the exact Master Style Suffix from the lore block.
- Keep camera, lighting, environment, clothing, and mood faithful to the active series. Do not import unrelated environments or occupations from previous series.
- Keep episodes visually distinct from one another. Do not reuse the same composition, room, office scene, laptop/tablet pose, group arrangement, camera angle, or emotional beat unless the user explicitly asks for a callback.
- Every frame's image_generation_prompt should include a concrete location, action, camera distance, and visual symbol specific to that episode's topic.
- Do not make every episode a sequence of desks, dashboards, laptop screens, tablet closeups, or meeting rooms. Unless the user specifically requests a screen-heavy episode, use at most one screen/dashboard-focused frame.
- Show the real-world place where the topic matters: customers, streets, shops, homes, factories, events, field work, service counters, or other concrete environments relevant to the episode.

## 4. OVERLAY RULES
- Include BOTH `text_overlay_vietnamese` and `text_overlays` for every frame.
- `text_overlays` items may only use type `"narration"` or `"dialogue"`.
- Overlays must feel like real comic writing, not labels or placeholders.
- For most frames, write at least one meaningful full sentence with a clear attitude, tension, observation, or payoff.
- Do not use fragment-only overlays like "Nỗi đau tự thân" or "Rời đi trong đêm" unless it is a deliberate final punch panel.
- Prefer roughly 8-18 words for the main overlay in most frames; go longer when the beat needs real meaning.
- If a line sounds like a summary tag, rewrite it into a sharper thought, confession, jab, or emotional beat.
- Dialogue Bubble Positioning to Prevent Face Overlapping: Dialogue bubbles must never overlap a character's face. Left-side speakers use `bottom-left` (preferred to avoid the head) or `top-left` (only if the head is positioned in the lower-middle section); right-side speakers use `bottom-right` (preferred) or `top-right`. Always ensure the bubble is positioned opposite or offset from the character's face, or instruct the image generator to keep character faces in the lower/middle section.
- Write overlays in natural, sharp Vietnamese. Avoid generic motivational copy, corporate jargon, abstract summaries, and textbook explanation.
- Prefer conflict, tension, surprise, embarrassment, contradiction, desire, fear, annoyance, or absurdity over bland advice.
- Let characters sound like real people with attitude. Use specific phrasing, not vague life-lesson language.
- Most frames should advance tension, reveal a turn, or land a punchline. Do not use filler bridge text that merely restates the topic.
- If a frame is narration, make it feel like a comic beat, not a lecture slide.
- If a frame is dialogue, give the speaker a clear emotional stance.
- Final-frame overlay should land with one of: twist, sting, payoff, ironic snap, or emotionally memorable aftertaste.

## 5. OUTPUT FORMAT
Return only a valid JSON object with this structure:
{
  "episode_number": 0,
  "episode_title": "Short sharp Vietnamese title with curiosity, tension, or irony; not a bland summary",
  "tutorial_summary": "One Vietnamese sentence capturing the episode's sharp core tension, contradiction, sting, or takeaway",
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
  "caption_post": "Vietnamese Facebook caption, 3-5 sentences, with a strong opening hook, specific emotional language, and 5-7 relevant hashtags at the end."
}
"""

DEFAULT_STYLE_SUFFIX = "[, rough black-and-white indie comic, wobbly hand-drawn ink lines, minimal flat background, awkward deadpan expressions, imperfect anatomy, DIY zine texture, sparse composition, low-polish handmade panel art --ar 4:3]"
STYLE_LOCK = "STYLE: rough near-monochrome indie comic, black-and-white or barely tinted palette, wobbly uneven ink lines, awkward deadpan faces, simple flat shapes, sparse hand-drawn backgrounds, intentionally imperfect anatomy and perspective, low-polish DIY zine energy; no glossy rendering, no cel-shading, no polished commercial-comic finish, no cinematic 3D, no painterly realistic lighting."
DEFAULT_FRAME_COUNT = 4
MIN_FRAME_COUNT = 1
MAX_FRAME_COUNT = 30
DEFAULT_COMIC_LANGUAGE = "vn"
DEFAULT_CHARACTER_SEED = 42691

# Ordered list of Gemini models to try, most capable first.
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"]

# Minimum scene length (chars) below which fit_image_prompt will warn.
_SCENE_TRUNCATION_WARN_THRESHOLD = 400
# Hard floor for character description inside the prompt budget loop.
_CHAR_DESC_MIN_LIMIT = 120


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


BLAND_TITLE_PATTERNS = [
    r"^bài học",
    r"^cách ",
    r"^khi ",
    r"^làm sao",
    r"^đừng ",
    r"^hãy ",
    r"^tại sao",
]

BLAND_PHRASES = [
    "bài học",
    "thông điệp",
    "trưởng thành",
    "chữa lành",
    "đẹp hơn",
    "cuối cùng",
    "hóa ra",
    "ai rồi cũng",
    "chỉ cần",
    "hãy nhớ",
    "chúng ta cần",
    "đôi khi",
    "đơn giản là",
    "sống thật",
    "giá trị thật",
]

WEAK_CAPTION_OPENERS = [
    "đôi khi",
    "có những lúc",
    "trong cuộc sống",
    "ai cũng có lúc",
    "bạn đã bao giờ",
    "chúng ta ai cũng",
]

TENSION_WORDS = [
    "nhục", "quê", "ghen", "tham", "sợ", "giả", "diễn", "lố", "ảo", "toang",
    "dối", "đố kỵ", "đau", "mắc cỡ", "cay", "tức", "đâm lao", "kệ", "liều",
]


def _normalize_text(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", str(text)).lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _collect_overlay_text(payload: dict) -> str:
    lines = []
    for frame in payload.get("frames", []) or []:
        overlay = frame.get("text_overlay_vietnamese")
        if overlay:
            lines.append(str(overlay))
        for item in frame.get("text_overlays", []) or []:
            txt = item.get("text") if isinstance(item, dict) else None
            if txt:
                lines.append(str(txt))
    return " ".join(lines)


def audit_episode_blandness(payload: dict) -> list:
    issues = []
    title = _normalize_text(payload.get("episode_title", ""))
    summary = _normalize_text(payload.get("tutorial_summary", ""))
    caption = str(payload.get("caption_post", "") or "").strip()
    caption_norm = _normalize_text(caption)
    overlays_raw = _collect_overlay_text(payload)
    overlays = _normalize_text(overlays_raw)
    frames = payload.get("frames", []) or []

    if not title or len(title) < 6:
        issues.append("title_too_weak")
    if any(re.search(pattern, title) for pattern in BLAND_TITLE_PATTERNS):
        issues.append("title_sounds_generic")
    if any(phrase in title for phrase in BLAND_PHRASES):
        issues.append("title_contains_bland_phrase")

    if summary and any(phrase in summary for phrase in BLAND_PHRASES[:8]):
        issues.append("summary_too_soft")

    if caption_norm:
        first_sentence = _normalize_text(re.split(r"[\n\.!?]", caption, maxsplit=1)[0])
        if any(first_sentence.startswith(x) for x in WEAK_CAPTION_OPENERS):
            issues.append("caption_weak_opening")
        if any(phrase in caption_norm for phrase in ["bài học", "chữa lành", "thông điệp", "hãy nhớ"]):
            issues.append("caption_marketing_tone")

    meaningful_frame_count = 0
    too_short_frame_count = 0
    if overlays:
        if not any(word in overlays for word in TENSION_WORDS):
            issues.append("not_enough_tension_words")
        bland_hits = sum(1 for phrase in BLAND_PHRASES if phrase in overlays)
        if bland_hits >= 2:
            issues.append("overlays_too_soft")

    for frame in frames:
        frame_texts = []
        overlay = str(frame.get("text_overlay_vietnamese") or "").strip()
        if overlay:
            frame_texts.append(overlay)
        for item in frame.get("text_overlays", []) or []:
            if isinstance(item, dict) and item.get("text"):
                frame_texts.append(str(item.get("text")).strip())
        joined = " ".join(x for x in frame_texts if x).strip()
        if not joined:
            too_short_frame_count += 1
            continue
        words = re.findall(r"\b\w+\b", joined, flags=re.UNICODE)
        sentence_like = any(p in joined for p in [".", "!", "?", ":", ";", ","]) or len(words) >= 12
        if len(words) < 12:
            too_short_frame_count += 1
        if sentence_like and len(words) >= 12:
            meaningful_frame_count += 1

    if frames:
        minimum_meaningful_frames = max(2, len(frames) - 1)
        if meaningful_frame_count < minimum_meaningful_frames:
            issues.append("overlays_not_meaningful_enough")
        if too_short_frame_count >= max(1, len(frames) // 2):
            issues.append("overlays_too_short")

        final_texts = []
        final_frame = frames[-1]
        if final_frame.get("text_overlay_vietnamese"):
            final_texts.append(str(final_frame.get("text_overlay_vietnamese")))
        for item in final_frame.get("text_overlays", []) or []:
            if isinstance(item, dict) and item.get("text"):
                final_texts.append(str(item.get("text")))
        final_norm = _normalize_text(" ".join(final_texts))
        if any(phrase in final_norm for phrase in ["đẹp hơn", "chữa lành", "bài học", "sống thật", "cuối cùng"]):
            issues.append("final_frame_too_motivational")

    return issues


def build_retry_prompt(topic: str, issues: list, attempt_number: int) -> str:
    issue_text = ", ".join(issues) if issues else "unknown blandness"
    return (
        f"\n\nRETRY {attempt_number}: the previous draft failed blandness audit ({issue_text}). "
        "Rewrite from scratch. Make it sharper, riskier, and more socially recognizable. "
        "Ban wholesome life-lesson endings. Ban LinkedIn-style inspiration. Ban soft summary titles. "
        "Most frames must contain at least one full, meaningful sentence with 12+ words. "
        "Do not use tiny fragment overlays, summary labels, or mood tags pretending to be comic text. "
        "Every frame should sound like an actual thought, accusation, confession, jab, or painful observation. "
        "The ending must sting, expose, embarrass, or darkly amuse. "
        "The caption opening must sound like a hot take, awkward confession, accusation, or uncomfortable truth. "
        f"Topic remains: {topic}."
    )


def build_language_instruction_block(comic_language: str) -> str:
    language = normalize_comic_language(comic_language)
    if language == "en":
        return (
            "LANGUAGE MODE: ENGLISH. "
            "Write all story-facing text in natural, sharp, internet-native English. "
            "That includes episode_title, tutorial_summary, caption_post, text_overlay_vietnamese, and every text_overlays[].text field. "
            "Do not output Vietnamese for those fields. Keep image_generation_prompt in English."
        )
    return (
        "LANGUAGE MODE: VIETNAMESE. "
        "Write all story-facing text in natural, sharp Vietnamese. "
        "That includes episode_title, tutorial_summary, caption_post, text_overlay_vietnamese, and every text_overlays[].text field. "
        "Do not switch to English unless the user explicitly asks for it. Keep image_generation_prompt in English."
    )


def build_episode_structure_instructions(frame_count):
    frame_count = parse_frame_count(frame_count)
    if frame_count <= 3:
        if frame_count <= 1:
            beats = "- Frame 1: a complete visual moment with problem, decision, and emotional result in one panel."
        elif frame_count == 2:
            beats = "\n".join([
                "- Frame 1: Hook / core problem.",
                "- Frame 2: Direct response / emotional result.",
            ])
        else:
            beats = "\n".join([
                "- Frame 1: Hook / core problem.",
                "- Frame 2: Complication created by pressure or new information.",
                "- Frame 3: Changed perspective, resolution, and a small forward hook.",
            ])
        format_name = "Short MVP Format"
        goal = "Minimalist comic strip with immediate emotional clarity"
        pacing = "Immediate tension and fast payoff"
        visual = "Simple panels carrying a sharp emotional or ironic beat"
    elif frame_count <= 6:
        # Format 1: The 4-6 Panel Test (The MVP)
        format_name = "Format 1: The 4–6 Panel Test (The MVP)"
        goal = "Idea validation and rapid prototyping. Ruthlessly eliminate anything that isn't structural load-bearing logic. No room for secondary characters, complex backgrounds, or elaborate setups."
        pacing = "Pure velocity. Every panel must deliver a dense unit of information."
        visual = "Lean heavily into a strict, minimalist aesthetic. Use industrial, no-shadow styling to ensure the core diagrams are readable at a glance. High cognitive load requires absolute clarity."
        
        hook_frames = [1]
        inversion_frames = [2]
        takeaway_frames = [frame_count]
        mechanics_frames = list(range(3, frame_count))
        
        beats_list = []
        beats_list.append(f"- Frame {hook_frames[0]} (1. The Hook): Open with a scroll-stopping pain point, awkward truth, or contradiction immediately.")
        beats_list.append(f"- Frame {inversion_frames[0]} (2. The Inversion): Deliver a sharp perspective shift, escalation, or uncomfortable reveal.")
        for idx, f in enumerate(mechanics_frames):
            beats_list.append(f"- Frame {f} (3. The Mechanics): Core diagram or highly condensed logic flow (part {idx + 1} of {len(mechanics_frames)}).")
        beats_list.append(f"- Frame {takeaway_frames[0]} (4. The Takeaway): Land the ending with payoff, sting, twist, or a rule that actually feels earned.")
        beats = "\n".join(beats_list)
    elif frame_count <= 12:
        # Format 2: The 8-10 Panel Social Read (The Standard)
        format_name = "Format 2: The 8–10 Panel Social Read (The Standard)"
        goal = "High engagement and shareability through recognizable tension, escalating social/emotional stakes, and a payoff that feels worth forwarding."
        pacing = "Build like a real read: hook fast, tighten pressure, turn the knife, then release with payoff. Each panel must add tension, surprise, vulnerability, or consequence — never lecture in place."
        visual = "Keep readability high, but stage scenes like a lived sequence instead of an explainer deck. Use visual hierarchy to separate emotional beats, consequences, and system logic."
        
        if frame_count <= 8:
            hook_frames = [1, 2]
            inversion_frames = [3]
            takeaway_frames = [frame_count]
        elif frame_count == 9:
            hook_frames = [1, 2]
            inversion_frames = [3, 4]
            takeaway_frames = [frame_count]
        else: # 10, 11, 12
            hook_frames = [1, 2]
            inversion_frames = [3, 4]
            takeaway_frames = list(range(frame_count - 1, frame_count + 1))
            
        mechanics_start = max(hook_frames) + len(inversion_frames) + 1
        mechanics_end = min(takeaway_frames) - 1
        mechanics_frames = list(range(mechanics_start, mechanics_end + 1))
        
        beats_list = []
        for idx, f in enumerate(hook_frames):
            if idx == 0:
                beats_list.append(f"- Frame {f} (1. The Hook): Open with the sharpest socially recognizable pain, awkward truth, or dangerous confession in the whole episode.")
            else:
                beats_list.append(f"- Frame {f} (1. The Hook): Deepen the hook by making the cost, embarrassment, desire, or contradiction more personal and specific.")
        for idx, f in enumerate(inversion_frames):
            if idx == 0:
                beats_list.append(f"- Frame {f} (2. The Inversion): Deliver the first hard turn — expose the false belief, hidden rule, or uncomfortable cause under the problem.")
            else:
                beats_list.append(f"- Frame {f} (2. The Inversion): Escalate the turn with a sharper contradiction, social consequence, or proof that the obvious fix fails.")
        for idx, f in enumerate(mechanics_frames):
            beats_list.append(f"- Frame {f} (3. The Mechanics): Advance the story through concrete cause-and-effect, visible consequences, or increasingly costly choices — never static explanation (step {idx + 1} of {len(mechanics_frames)}).")
        for idx, f in enumerate(takeaway_frames):
            if idx == 0 and len(takeaway_frames) > 1:
                beats_list.append(f"- Frame {f} (4. The Payoff): Start the landing: show the emotional release, earned insight, or reversal created by the previous pressure.")
            else:
                beats_list.append(f"- Frame {f} (4. The Takeaway): End with a quotable sting, payoff, or concluding line that feels earned enough to share.")
        beats = "\n".join(beats_list)
    else:
        # Format 3: The 20-30 Panel Deep Read (The Deep Dive)
        format_name = "Format 3: The 20–30 Panel Deep Read (The Deep Dive)"
        goal = "Authority, behavioral change, and deep systemic understanding without losing emotional momentum or binge-readability."
        pacing = "Think long-form thread, not textbook: hook hard, compound pressure, reveal deeper systems, vary intensity, and keep paying the reader back with insight, recognition, and reversals."
        visual = "Use negative space and sequence contrast to control energy. Alternate between stark emotional beats, concrete lived scenes, and system-mapping frames so the episode breathes instead of reading like one long lecture."
        
        if frame_count <= 19:
            hook_count = 3
            inversion_count = 2
            takeaway_count = 3
        elif frame_count <= 24:
            hook_count = 4
            inversion_count = 2
            takeaway_count = 4
        else:
            hook_count = 5
            inversion_count = 3
            takeaway_count = 7 if frame_count >= 30 else 6
            
        hook_frames = list(range(1, hook_count + 1))
        inversion_frames = list(range(hook_count + 1, hook_count + inversion_count + 1))
        takeaway_frames = list(range(frame_count - takeaway_count + 1, frame_count + 1))
        mechanics_frames = list(range(hook_count + inversion_count + 1, frame_count - takeaway_count + 1))
        
        beats_list = []
        for idx, f in enumerate(hook_frames):
            if idx == 0:
                beats_list.append(f"- Frame {f} (1. The Hook): Open with the most emotionally legible pain, taboo, resentment, or quietly brutal truth in the episode.")
            elif idx == 1:
                beats_list.append(f"- Frame {f} (1. The Hook): Make the pain more specific through a socially recognizable scene, personal cost, or humiliating pattern.")
            else:
                beats_list.append(f"- Frame {f} (1. The Hook): Keep tightening the reader's recognition with sharper stakes, hypocrisy, or pressure that is hard to ignore.")
        for idx, f in enumerate(inversion_frames):
            if idx == 0:
                beats_list.append(f"- Frame {f} (2. The Inversion): Introduce the new mental model by exposing the hidden rule, false assumption, or systemic trap under the visible problem.")
            else:
                beats_list.append(f"- Frame {f} (2. The Inversion): Strengthen the turn with evidence, contradiction, or a more uncomfortable implication of the new model.")
        for idx, f in enumerate(mechanics_frames):
            beats_list.append(f"- Frame {f} (3. The Mechanics): Deepen through concrete consequences, failed coping strategies, decision points, edge cases, or cascading tradeoffs — never dry explanation (step {idx + 1} of {len(mechanics_frames)}).")
        for idx, f in enumerate(takeaway_frames):
            if idx == 0:
                beats_list.append(f"- Frame {f} (4. The Payoff): Begin the landing with the first real release, reversal, synthesis, or emotionally earned conclusion.")
            elif idx == len(takeaway_frames) - 1:
                beats_list.append(f"- Frame {f} (4. The Final Sting): Close with the heaviest line, clearest action rule, or philosophical aftertaste in the whole episode.")
            else:
                beats_list.append(f"- Frame {f} (4. The Takeaway): Continue the landing with practical consequence, emotional clarity, or a stronger synthesis than the previous frame.")
        beats = "\n".join(beats_list)

    return f"""# NARRATIVE FORMAT: {format_name}
## Goal: {goal}
## Pacing Strategy: {pacing}
## Visual Execution: {visual}

# EPISODE FRAME COUNT & PACING
Generate exactly {frame_count} frames.
Number frame_number sequentially from 1 to {frame_count}. Do not skip or add frames.

## Beat Map
{beats}

## Pacing Guardrails
- If the episode feels flat, strengthen Act 2: make the complications harder, more specific, and less comfortable.
- Medium and long formats must feel like progression, not repetition: each new section should either deepen the problem, widen the consequences, expose a hidden rule, or shift the emotional temperature.
- When there are enough frames, show A-story, B-story, and C-story pressure building toward the climax instead of repeating the same action.
- The climax should resolve the episode's A-story, but the fallout should point toward a larger season arc when the frame count allows it.
- Boring is failure: avoid safe, generic, purely explanatory, or motivational-social-post language.
- Every frame should do at least one of these: escalate pressure, reveal character, sharpen contrast, create curiosity, create consequence, or land a punch.
- Long format must earn its length: every 2-4 frames should produce a new turn, sharper implication, or deeper layer of recognition.
- Use concrete, human, socially recognizable moments instead of abstract commentary whenever possible.
- Prefer sentences that feel quotable, awkwardly true, slightly dangerous, or painfully specific over polished but forgettable wording.
- Compression matters: cut throat-clearing, remove redundant setup, and never explain what the image already shows.
- If the text could fit equally well on a LinkedIn post, it is too bland for this comic.
- Make the episode visually specific: vary location, action, camera distance, props, and emotional staging across frames and compared with recent episodes.
- Avoid repeating generic team meetings, laptop/tablet closeups, dashboard screens, and standing group shots unless they are necessary to the topic.
- Use no more than one screen/dashboard/laptop-focused frame. Put the rest in concrete real-world environments with visible action and topic-specific stakes.
- For 4+ frames, use at least two distinct settings. For 6+ frames, use at least three distinct settings.
- Use no more than one co-working space, office, or meeting-room interior. If a work room is necessary, stage physical action instead of people facing devices.
- For digital products, visualize consequences through customers, shelves, receipts, deliveries, street signs, hand-written notes, prototypes, service counters, or public reactions.
- For 6+ frames, include at least one public/customer location, one hands-on work or testing location, one exterior location-specific frame, and one emotionally intimate frame.
- Give neighboring frames different camera distances: wide establishing, medium interaction, over-the-shoulder, tactile close-up, exterior wide, quiet close-up, etc.
- No two image_generation_prompt values may start with the same location, pose, or character arrangement.
"""


def require_frame_count(payload, frame_count, episode_key=None):
    frame_count = parse_frame_count(frame_count)
    episode_payload = payload.get(episode_key, {}) if episode_key else payload
    frames = episode_payload.get("frames", []) if isinstance(episode_payload, dict) else []
    if len(frames) != frame_count:
        raise ValueError(f"Gemini returned {len(frames)} frames, expected {frame_count}.")
    for index, frame in enumerate(frames, start=1):
        if isinstance(frame, dict):
            frame["frame_number"] = index
    episode_payload["frame_count"] = frame_count
    return payload


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
4. Use only "dialogue" or "narration" overlay types. Most frames should contain at least one meaningful full sentence, not just a short label. Keep overlays readable, but prioritize sharpness, tension, specificity, and payoff over being ultra-short.
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


# Legacy series names / terms that should never bleed into new series output.
# Add entries here when a new series is archived. Do NOT put character names
# here — use the protagonist_name parameter for that so the replacement is
# context-aware and won't corrupt future series with the same name.
_LEGACY_BIAS_REPLACEMENTS = [
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
]


def scrub_legacy_bias(value, source_text="", protagonist_name="", legacy_names=None):
    """
    Remove old-project language from newly initialized series payloads.

    Args:
        value:           The value to scrub (dict / list / str).
        source_text:     The original user input — needles present here are kept.
        protagonist_name: The *new* series protagonist. Any old protagonist names
                         passed via ``legacy_names`` that don't match this will
                         be replaced with protagonist_name.
        legacy_names:    Extra (old) character/series names to replace.  Pass a
                         list of strings.  Defaults to empty list.
    """
    if isinstance(value, dict):
        return {k: scrub_legacy_bias(v, source_text, protagonist_name, legacy_names) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub_legacy_bias(v, source_text, protagonist_name, legacy_names) for v in value]
    if not isinstance(value, str):
        return value

    replacements = list(_LEGACY_BIAS_REPLACEMENTS)
    # Add caller-supplied old protagonist/character names
    for old_name in (legacy_names or []):
        old_name = str(old_name).strip()
        if old_name and old_name.casefold() != (protagonist_name or "").casefold():
            replacements.append((old_name, protagonist_name or "the protagonist"))

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
            "Suggest exactly one new, highly engaging topic for the active series. It should feel scroll-stopping, emotionally legible, and specific enough to trigger scenes instead of generic advice. "
            "Prefer awkward truth, contradiction, social pain, petty desire, embarrassment, obsession, delusion, or absurd escalation over bland educational framing. "
            "Do not reuse any legacy character, setting, genre, occupation, visual motif, or theme not present in the active series lore.\n"
            "Return ONLY the topic title, with a brief sharp Vietnamese explanation in parentheses. Make it sound like something a real person would click, not a workshop title. "
            "Do not include any other text or markdown formatting."
        )
        for model_name in GEMINI_MODELS:
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

    def generate_episode(self, topic: str, episode_num: int = 1, database_context: str = "", frame_count: int = DEFAULT_FRAME_COUNT, comic_language: str = DEFAULT_COMIC_LANGUAGE) -> dict:
        """
        Calls Gemini to generate the structured comic JSON payload for a given topic.
        """
        frame_count = parse_frame_count(frame_count)
        comic_language = normalize_comic_language(comic_language)
        print(f"Generating comic payload for topic: '{topic}' in language '{comic_language}'...")
        
        series_title = "the active series"
        if os.path.exists("series_config.json"):
            try:
                with open("series_config.json", "r", encoding="utf-8") as f:
                    series_title = json.load(f).get("series_title") or series_title
            except Exception:
                pass

        text_language_name = "English" if comic_language == "en" else "Vietnamese"
        primary_character = get_primary_character_config()
        protagonist_name = primary_character.get("name", "")
        protagonist_requested = text_mentions_name(topic, protagonist_name) if protagonist_name else False
        prompt = (
            f"Please generate Episode {episode_num} of '{series_title}'.\n"
            f"Requested frame count: {frame_count}\n"
            f"Requested comic text language: {text_language_name} ({comic_language})\n"
            f"User topic/source prompt: {topic}\n"
            "Resolve any @ references from the ACTIVE SERIES DATABASE. "
            "Use only the current series database and this user prompt as story context.\n"
            "The episode must feel immediately clickable, emotionally specific, and non-boring. Avoid lecture energy, generic takeaways, and safe corporate phrasing. "
            "Build around a recognizable human tension: craving, shame, envy, fear, denial, pettiness, pressure, misunderstanding, or absurd escalation. "
            "Episode title should be short, sharp, and curiosity-driving, not a bland summary. "
            "caption_post should open with a strong hook, sound human, and make the reader want to comment/share instead of feeling like generic content marketing.\n"
            "Visual novelty requirement: avoid repeating recent episode compositions. Use real-world, topic-specific settings and actions. "
            "Do not make more than one frame primarily about a laptop/tablet/dashboard/screen unless the user explicitly asks for that. "
            "A frame set with repeated co-working rooms, office interiors, laptop poses, tablet-reading poses, or wall-monitor demos should be treated as a failed visual plan."
        )
        if protagonist_requested:
            prompt += (
                f"\nCRITICAL CHARACTER PRESENCE RULE: The user explicitly requested {protagonist_name}. "
                f"{protagonist_name} must be visibly present in every frame of this episode, not just implied in text. "
                f"Every frame's image_generation_prompt must explicitly name {protagonist_name} and describe their visible pose/action/expression in the scene."
            )
        
        lore_block = database_context or load_database_prompt_block(topic)
        structure_block = build_episode_structure_instructions(frame_count)
        language_block = build_language_instruction_block(comic_language)
        sys_prompt_parts = [item for item in (lore_block, SYSTEM_PROMPT, language_block, structure_block) if item]
        sys_prompt = "\n\n".join(sys_prompt_parts)
        if lore_block:
            print("Loaded active series database context into Gemini prompt.")
        

        last_err = None
        max_attempts_per_model = 3
        best_payload = None
        best_issue_count = float('inf')
        for model_name in GEMINI_MODELS:
            attempt_prompt = prompt
            for attempt_idx in range(1, max_attempts_per_model + 1):
                try:
                    print(f"Attempting comic generation using ({model_name}) [attempt {attempt_idx}/{max_attempts_per_model}]...")
                    response = self.client.models.generate_content(
                        model=model_name,
                        contents=attempt_prompt,
                        config={
                            "system_instruction": sys_prompt,
                            "response_mime_type": "application/json"
                        }
                    )
                    payload = json.loads(response.text.strip())
                    payload["episode_number"] = episode_num
                    require_frame_count(payload, frame_count)
                    issues = audit_episode_blandness(payload)
                    if len(issues) < best_issue_count:
                        best_payload = payload
                        best_issue_count = len(issues)
                    if not issues:
                        print(f"Blandness audit passed for {model_name} attempt {attempt_idx}.")
                        return prepare_episode_payload_for_generation(payload)
                    print(f"Blandness audit failed for {model_name} attempt {attempt_idx}: {', '.join(issues)}")
                    if attempt_idx < max_attempts_per_model:
                        attempt_prompt = prompt + build_retry_prompt(topic, issues, attempt_idx + 1)
                        continue
                    # Last attempt on this model still has issues — try next model
                    break
                except Exception as e:
                    print(f"Failed to generate episode using {model_name} attempt {attempt_idx}: {e}")
                    last_err = e
                    if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                        print("Rate limit reached. Sleeping 6 seconds...")
                        time.sleep(6)
                    if attempt_idx < max_attempts_per_model:
                        attempt_prompt = prompt + build_retry_prompt(topic, [f"generation_error:{type(e).__name__}"], attempt_idx + 1)
                        continue
                    break

        # All models exhausted — use the best result we got (fewest blandness issues)
        if best_payload is not None:
            print(f"All models exhausted. Using best payload with {best_issue_count} issue(s).")
            return prepare_episode_payload_for_generation(best_payload)
        raise last_err

    def create_new_series(self, data: dict) -> dict:
        """
        Initializes a new comic series based on structured user input describing theme/protagonist.
        Returns a dictionary with both 'series_config' and 'episode' (Episode 1).
        """
        title = data.get("title", "").strip() or "Untitled Series"
        frame_count = parse_frame_count(data.get("frame_count"))
        comic_language = normalize_comic_language(data.get("comic_language"))
        plot = data.get("plot", "").strip() or f"A character-led {frame_count}-frame visual story series"
        char_name = data.get("character_name", "").strip() or "Protagonist"
        char_desc = data.get("character_desc", "").strip() or f"{char_name}, described by the active series premise"
        setting_desc = data.get("setting_desc", "").strip() or "A setting defined by the active series premise"

        print(f"Initializing new series '{title}' for protagonist '{char_name}'...")
        
        text_language_name = "English" if comic_language == "en" else "Vietnamese"
        prompt = (
            f"Please initialize a brand new comic series. Here are the user's structured inputs:\n"
            f"- Series Title: {title}\n"
            f"- Plot / Intro: {plot}\n"
            f"- Protagonist Name: {char_name}\n"
            f"- Protagonist Visual Description: {char_desc}\n"
            f"- Setting Description: {setting_desc}\n"
            f"- Requested Episode 1 Frame Count: {frame_count}\n"
            f"- Requested Comic Text Language: {text_language_name} ({comic_language})\n\n"
            f"Generate both the series_config metadata and Episode 1 (introductory episode) details."
        )
        
        structure_block = build_episode_structure_instructions(frame_count)
        system_instruction = """
You are a Lead Storyteller and visual continuity designer. Your job is to initialize a new comic series based only on the user's prompt describing the title, plot, setting, theme, and protagonist.

LANGUAGE OUTPUT RULE:
- All story-facing text fields for the episode must be written in __TEXT_LANGUAGE_NAME__.
- That includes: episode_title, tutorial_summary, caption_post, text_overlay_vietnamese, and every text_overlays[].text field.
- Keep image_generation_prompt in English for image model compatibility.
- Do not write placeholder-like micro-lines. The comic text should read like finished writing with meaning, voice, and emotional specificity.

ANTI-BIAS RULES:
- Do not reuse any protagonist, setting, object, occupation, genre, tone, visual motif, or plot mechanic from a previous series.
- Do not reuse any legacy series names, protagonists, settings, tutorial formats, occupations, genres, visual motifs, or emotional themes unless the user explicitly requested them.
- Never default to old project concepts, legacy names, legacy art styles, or prior tutorial formats unless those exact ideas are present in the user's new series input.
- If the user does not name a specific visual style, use a rough near-monochrome handmade indie-comic style derived from the new character and setting only.
- Always ensure that both master_style_suffix and style_lock are visually consistent, describing the same art style, coloring, and medium (do not mix Ghibli style with rough black-and-white indie comic style, for example, unless the user explicitly requested it).
- Treat the user's structured inputs below as the complete source of truth.

You must generate:
1. The configuration for this series (protagonist name, detailed visual description, setting, master style suffix, and structured lore arrays for characters, objects, and settings).
2. Episode 1 (Intro/Setup) of this new series, matching the requested plot and setting, with exactly __FRAME_COUNT__ frames.

__STRUCTURE_BLOCK__

CHARACTER DESIGN RULES:
- Each character description must be a reusable canonical visual prompt, not a short role label.
- Include stable face shape, hair, age range, build, outfit, color palette, and one or two distinctive details.
- Episode image prompts must name visible characters and include their exact canonical descriptions.
- Do not change a recurring character's outfit, hairstyle, body type, or apparent age between frames unless the user explicitly requests it.

CRITICAL OVERLAY RULES:
- The overlay `type` field must strictly be one of: "narration" or "dialogue". "thought" and "shout" are NOT allowed.
- Speech Bubble Pointer Alignment & Face Overlap Prevention: Dialogue bubbles must never overlap a character's face. Dialogue bubbles must be positioned opposite or offset from the character's face. Left-side speakers use `bottom-left` (preferred to avoid the head) or `top-left` (only if the head is positioned low); right-side speakers use `bottom-right` (preferred) or `top-right`.
- Speech Bubble Pointer tails must point toward the speaking character. To ensure this, position the bubble near the speaker's described location in the image.

Strictly return a JSON object with this exact structure:
{
  "series_config": {
    "series_title": "Exact series title from the user's input",
    "protagonist_name": "Name of protagonist (single word or simple name)",
    "protagonist_description": "Detailed reusable visual description of the protagonist based only on the user input",
    "setting_description": "Brief reusable description of the setting, atmosphere, palette, and mood based only on the user input",
    "master_style_suffix": "Master style suffix to append to image prompts, derived from the requested series style and setting",
    "style_lock": "Detailed visual style lock constraints (e.g. mostly black-and-white, wobbly hand-drawn ink lines, minimal flat backgrounds, awkward deadpan expressions) to prevent style drift",
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
    "frame_count": __FRAME_COUNT__,
    "episode_title": "String — Vietnamese title of the introductory episode",
    "tutorial_summary": "One sentence in Vietnamese summarizing the episode or takeaway",
    "materials_list": [],
    "frames": [
      {
        "frame_number": 1,
        "panel_type": "Hook / Situation",
        "text_overlay_vietnamese": "Tôi vừa bước vào mà căn phòng này đã nhìn tôi như một lỗi đánh máy.",
        "text_overlays": [
          { "type": "narration", "text": "Tôi vừa bước vào mà căn phòng này đã nhìn tôi như một lỗi đánh máy.", "position": "top-left" },
          { "type": "dialogue", "character": "Name", "text": "Chưa ai đuổi tôi, nhưng bầu không khí đã làm chuyện đó rồi.", "position": "bottom-right" }
        ],
        "image_generation_prompt": "English description introducing the protagonist and setting + Master Style Suffix"
      },
      {
        "frame_number": 2,
        "panel_type": "Action / Complication",
        "text_overlay_vietnamese": "Tôi gọi một ly cho đỡ lạc lõng, nhưng cái ly cũng không muốn nhận họ hàng với tôi.",
        "text_overlays": [
          { "type": "narration", "text": "Tôi gọi một ly cho đỡ lạc lõng, nhưng cái ly cũng không muốn nhận họ hàng với tôi.", "position": "top-left" },
          { "type": "dialogue", "character": "Name", "text": "Ở đây ai cũng giả vờ ổn. Tôi thì lười tới mức đó.", "position": "bottom-right" }
        ],
        "image_generation_prompt": "English description of the action or complication + Master Style Suffix"
      },
      {
        "frame_number": 3,
        "panel_type": "Insight / Turning Point",
        "text_overlay_vietnamese": "Tôi tưởng mình ghét đám đông, hóa ra tôi chỉ ghét cảm giác chẳng thuộc về đâu.",
        "text_overlays": [
          { "type": "narration", "text": "Tôi tưởng mình ghét đám đông, hóa ra tôi chỉ ghét cảm giác chẳng thuộc về đâu.", "position": "top-left" },
          { "type": "dialogue", "character": "Name", "text": "Thứ làm tôi khó chịu nhất không phải loài người. Là việc tôi bắt đầu giống họ.", "position": "bottom-right" }
        ],
        "image_generation_prompt": "English description of the insight or turning point + Master Style Suffix"
      },
      {
        "frame_number": 4,
        "panel_type": "Result / Emotional Beat",
        "text_overlay_vietnamese": "Tôi rời đi y như lúc đến: không thuộc về nơi này, chỉ hiểu mình hơn một chút.",
        "text_overlays": [
          { "type": "narration", "text": "Tôi rời đi y như lúc đến: không thuộc về nơi này, chỉ hiểu mình hơn một chút.", "position": "top-left" },
          { "type": "dialogue", "character": "Name", "text": "Có vài đêm không chữa được gì. Chúng chỉ gọi đúng tên căn bệnh.", "position": "bottom-right" }
        ],
        "image_generation_prompt": "English description of the final emotional/result beat + Master Style Suffix"
      }
    ],
    "caption_post": "Đoạn văn 3-5 câu làm caption Facebook, kể về bối cảnh mới và tập đầu tiên này, cuối có 5-7 hashtag liên quan."
  }
}
"""
        system_instruction = system_instruction.replace("__FRAME_COUNT__", str(frame_count)).replace("__STRUCTURE_BLOCK__", structure_block).replace("__TEXT_LANGUAGE_NAME__", text_language_name)
        
        last_err = None
        for model_name in GEMINI_MODELS:
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
                require_frame_count(payload, frame_count, "episode")
                payload.setdefault("series_config", {})["comic_language"] = comic_language
                payload.setdefault("episode", {})["comic_language"] = comic_language
                source_text = json.dumps(data, ensure_ascii=False)
                return scrub_legacy_bias(payload, source_text, char_name)
            except Exception as e:
                print(f"Failed to generate new series using {model_name}: {e}")
                last_err = e
                if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                    print("Rate limit reached. Sleeping 6 seconds...")
                    time.sleep(6)
        
        raise last_err

    def deduce_series_style_and_characters(self, config_data: dict) -> dict:
        """
        Uses multimodal Gemini to deduce master_style_suffix, style_lock, and
        refined character visual descriptions from style reference and character images.
        """
        series_title = config_data.get("series_title", "").strip() or "Untitled"
        series_plot = config_data.get("series_plot", "").strip() or ""
        ref_path = config_data.get("style_reference_path", "").strip()
        characters = config_data.get("characters", []) or []
        
        style_image_path = ""
        if ref_path:
            style_image_path = clean_local_ref_path(ref_path)
            if not os.path.exists(style_image_path):
                style_image_path = ""
                
        prompt = (
            "You are a visual design expert. Analyze the provided style reference image (if any), "
            "any character reference images, and the series information below to deduce "
            "the visual style configurations and refine character visual descriptions for a comic series.\n\n"
            f"Series Title: {series_title}\n"
            f"Series Plot: {series_plot}\n\n"
            "You must output a JSON object with the following structure:\n"
            "{\n"
            "  \"master_style_suffix\": \"[, style details here --ar 4:3]\",\n"
            "  \"style_lock\": \"STYLE: detailed style constraints, detailing what to avoid (e.g. no glossy rendering, no cel-shading, no cinematic 3D)\",\n"
            "  \"characters\": [\n"
            "    {\n"
            "      \"name\": \"character name\",\n"
            "      \"description\": \"rich visual description (face shape, hair style/color, age range, build, typical costume/outfit, color palette, and key distinctive details)\"\n"
            "    }\n"
            "  ]\n"
            "}\n\n"
            "Rules for deduction:\n"
            "1. Master Style Suffix & Style Lock:\n"
            "   - If a style reference image is provided, analyze its artistic style (line thickness, coloring method, shading, level of detail, mood) and match it exactly. "
            "Ensure that any text, speech bubbles, panels, or layout elements in the image are IGNORED, focusing only on the drawing style and aesthetic.\n"
            "   - If no style reference image is provided, deduce an appropriate visual style based on the series title and plot.\n"
            "   - The master_style_suffix must start with '[, ' and end with ' --ar 4:3]'. The style_lock must start with 'STYLE: '.\n"
            "2. Character Descriptions:\n"
            "   - For each character listed below, refine their description. "
            "If a character image is provided, analyze the character's appearance in the image (face shape, hair color/style, clothing, build, age) and describe it precisely. "
            "If no image is provided, expand their current description into a detailed, consistent visual model prompt. "
            "Ensure the description is highly specific and includes a default typical outfit/costume and age to lock their appearance and prevent outfit changing between frames.\n"
            "   - Ensure the description is in English, 1-2 descriptive sentences.\n\n"
            "Characters to refine:\n"
        )
        for char in characters:
            prompt += f"- Name: {char.get('name')}, Current Description: {char.get('description')}\n"

        contents = []
        
        # 1. Add Style Reference Image if it exists
        if style_image_path:
            try:
                from PIL import Image
                style_img = Image.open(style_image_path)
                contents.extend(["[Style Reference Image]", style_img])
                print(f"Added style reference image to Gemini contents: {style_image_path}")
            except Exception as e:
                print(f"Failed to load style reference image: {e}")
                
        # 2. Add Character Reference Images if they exist
        for char in characters:
            name = char.get("name")
            c_ref_path = char.get("image_ref_path")
            if c_ref_path:
                local_path = clean_local_ref_path(c_ref_path)
                if local_path and os.path.exists(local_path):
                    try:
                        from PIL import Image
                        char_img = Image.open(local_path)
                        contents.extend([f"[Character Image for {name}]", char_img])
                        print(f"Added character reference image for {name} to Gemini contents: {local_path}")
                    except Exception as e:
                        print(f"Failed to load character image for {name}: {e}")
                        
        contents.append(prompt)
        
        last_err = None
        for model_name in GEMINI_MODELS:
            try:
                print(f"Attempting style and character deduction using ({model_name})...")
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config={
                        "response_mime_type": "application/json"
                    }
                )
                result = json.loads(response.text.strip())
                
                # Update style configuration
                config_data["master_style_suffix"] = result.get("master_style_suffix", config_data.get("master_style_suffix", ""))
                config_data["style_lock"] = result.get("style_lock", config_data.get("style_lock", ""))
                
                # Update character descriptions
                refined_chars = result.get("characters", [])
                refined_map = {c.get("name", "").lower(): c.get("description", "") for c in refined_chars}
                
                for char in config_data.get("characters", []):
                    name_lower = char.get("name", "").lower()
                    if name_lower in refined_map and refined_map[name_lower]:
                        char["description"] = refined_map[name_lower]
                        # Also update protagonist_description if it matches protagonist_name
                        if name_lower == config_data.get("protagonist_name", "").lower():
                            config_data["protagonist_description"] = refined_map[name_lower]
                            
                return config_data
            except Exception as e:
                print(f"Failed to deduce style/characters using {model_name}: {e}")
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


def get_series_visual_config(config_path="series_config.json"):
    if not os.path.exists(config_path):
        return {"characters": [], "settings": [], "master_style_suffix": DEFAULT_STYLE_SUFFIX}
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = json.load(f)
    except Exception as e:
        print(f"Error loading series visual config: {e}")
        return {"characters": [], "settings": [], "master_style_suffix": DEFAULT_STYLE_SUFFIX}

    characters = [item for item in config_data.get("characters", []) if isinstance(item, dict)]
    if not characters and config_data.get("protagonist_name"):
        characters = [{
            "name": config_data.get("protagonist_name", ""),
            "description": config_data.get("protagonist_description", ""),
            "image_ref_path": "",
        }]

    return {
        "characters": characters,
        "settings": [item for item in config_data.get("settings", []) if isinstance(item, dict)],
        "master_style_suffix": str(config_data.get("master_style_suffix") or DEFAULT_STYLE_SUFFIX).strip(),
    }


def text_mentions_name(text, name):
    if not text or not name:
        return False
    text = str(text)
    name = str(name).strip()
    if not name:
        return False

    escaped = re.escape(name)
    at_pattern = rf"(?<![\w])@{escaped}(?![\w])"
    if re.search(at_pattern, text, flags=re.IGNORECASE):
        return True

    plain_pattern = rf"(?<![\w@]){escaped}(?![\w])"
    flags = 0 if len(name) <= 2 else re.IGNORECASE
    return re.search(plain_pattern, text, flags=flags) is not None


def frame_mentions_character(frame, character_name):
    if not character_name:
        return False
    return text_mentions_name(frame_visibility_text(frame), character_name)


def frame_visibility_text(frame):
    if not isinstance(frame, dict):
        return json.dumps(frame, ensure_ascii=False)
    search_frame = dict(frame)
    for key in ("image_generation_prompt", "raw_image_generation_prompt"):
        if key in search_frame:
            search_frame[key] = strip_prompt_scaffold(search_frame.get(key, ""))
    return json.dumps(search_frame, ensure_ascii=False)


def visible_character_records(frame, characters, extra_text=""):
    haystack = frame_visibility_text(frame)
    extra_text = str(extra_text or "")
    visible = []
    for character in characters:
        name = str(character.get("name") or "").strip()
        if name and (text_mentions_name(haystack, name) or text_mentions_name(extra_text, name)):
            visible.append(character)
    return visible


def stable_seed_for_characters(characters, fallback_seed=DEFAULT_CHARACTER_SEED):
    import hashlib
    names = [str(item.get("name") or "").strip().casefold() for item in characters if item.get("name")]
    if not names:
        return -1
    digest = hashlib.sha256("|".join(sorted(names)).encode("utf-8")).hexdigest()
    return fallback_seed + (int(digest[:8], 16) % 100000)


def compact_character_description(description, limit=185):
    description = re.sub(r"\s+", " ", str(description or "")).strip()
    if len(description) <= limit:
        return description
    return description[:limit].rsplit(" ", 1)[0].rstrip(" ,.;:") + "..."


def strip_prompt_scaffold(prompt):
    prompt = str(prompt or "").strip()
    if ("CHARACTER LOCK" in prompt or "STYLE LOCK" in prompt) and "SCENE:" in prompt:
        prompt = prompt.split("SCENE:", 1)[1].strip()
    while prompt.startswith("SCENE:"):
        prompt = prompt.split("SCENE:", 1)[1].strip()
    for marker in (" STYLE:", " CHARACTER CONTINUITY:", " CHARACTER LOCK", " STYLE LOCK"):
        index = prompt.find(marker)
        if index > 0:
            prompt = prompt[:index].strip()
    prompt = re.sub(r"^IMAGE PROMPT:\s*", "", prompt, flags=re.IGNORECASE).strip()
    return prompt


SCREEN_FOCUS_PATTERN = re.compile(
    r"\b(laptop|tablet|dashboard|screen|monitor|interface|code|coding|app\s+interface|digital\s+interface)\b",
    flags=re.IGNORECASE,
)


def is_screen_focused_prompt(prompt):
    return SCREEN_FOCUS_PATTERN.search(str(prompt or "")) is not None


def deemphasize_screen_focus(prompt):
    scene = str(prompt or "")
    replacements = [
        (r"\bshared transparent tablet\b", "wall of printed feedback cards"),
        (r"\btablet\b", "paper notebook"),
        (r"\blaptop screen\b", "desk of annotated debugging notes"),
        (r"\blaptop\b", "notebook and printed prototype notes"),
        (r"\bdashboard screens?\b", "wall charts"),
        (r"\bdashboard\b", "wall chart"),
        (r"\blarge wall-mounted monitor\b", "large wall-mounted storyboard"),
        (r"\bmonitor\b", "storyboard"),
        (r"\bscreen\b", "paper mockup"),
        (r"\bdigital interface\b", "printed interface mockup"),
        (r"\binterface\b", "paper prototype"),
        (r"\blines of complex code\b", "annotated bug cards and printed flow notes"),
        (r"\bcode\b", "debugging notes"),
        (r"\bcoding corner\b", "hands-on testing corner"),
    ]
    for pattern, replacement in replacements:
        scene = re.sub(pattern, replacement, scene, flags=re.IGNORECASE)
    return scene


def visual_variety_directive(frame_index, frame_count, screen_allowed=True):
    patterns = [
        "wide establishing shot with strong place details and foreground action",
        "medium public/customer interaction with expressive body language",
        "over-the-shoulder problem-solving shot with tactile notes, maps, or physical objects",
        "close-up hands-on test or repair moment with concrete props",
        "medium-wide climax or decision scene with visible stakes in the environment",
        "exterior or rooftop fallout shot with a distinct skyline, street, or weather cue",
        "quiet intimate close-up focused on emotion and consequence",
        "dynamic diagonal composition showing movement through a real location",
    ]
    pattern = patterns[(max(1, int(frame_index)) - 1) % len(patterns)]
    note = (
        f"VISUAL VARIATION: {pattern}; make this frame composition, camera distance, "
        "location, pose, and props distinct from neighboring frames."
    )
    if frame_count >= 6:
        note += " Across this episode, preserve at least three visibly different locations."
    if not screen_allowed:
        note += (
            " Do not center any laptop, tablet, dashboard, monitor, UI, or glowing screen; "
            "show digital work through physical evidence, customer behavior, printed notes, "
            "receipts, shelves, tools, street signage, or people reacting."
        )
    return note


def choose_allowed_screen_frame(frames):
    screen_indexes = []
    for index, frame in enumerate(frames):
        if not isinstance(frame, dict):
            continue
        source = frame.get("raw_image_generation_prompt") or frame.get("image_generation_prompt", "")
        if is_screen_focused_prompt(source):
            screen_indexes.append(index)
    if not screen_indexes:
        return -1
    target = min(len(frames) - 1, max(0, int(len(frames) * 0.75)))
    return min(screen_indexes, key=lambda index: abs(index - target))


def remove_redundant_character_descriptions(prompt, characters):
    scene = str(prompt or "")
    action_starters = (
        "is", "are", "was", "were", "stands", "stand", "sits", "sit", "walks", "walk",
        "looks", "look", "works", "work", "listens", "listen", "holds", "hold",
        "points", "point", "discusses", "discuss", "meets", "meet", "interviews",
        "interview", "tests", "test", "reviews", "review", "enjoys", "enjoy",
        "gathers", "gather", "faces", "face", "confronts", "confront",
    )
    action_pattern = "|".join(action_starters)
    for character in characters:
        name = str(character.get("name") or "").strip()
        description = re.sub(r"\s+", " ", str(character.get("description") or "")).strip()
        if not name or not description:
            continue

        profile_variants = {description.rstrip(" .;,")}
        desc_without_article = re.sub(r"^(a|an)\s+", "", description, flags=re.IGNORECASE).strip()
        if desc_without_article and desc_without_article != description:
            profile_variants.add(desc_without_article.rstrip(" .;,"))

        for profile in sorted((item for item in profile_variants if item), key=len, reverse=True):
            profile_pattern = re.escape(profile)
            trailing_punctuation = r"\s*[\.,;:]?"
            scene = re.sub(
                rf"@?{re.escape(name)}\s*,\s*{profile_pattern}{trailing_punctuation}",
                name,
                scene,
                flags=re.IGNORECASE,
            )
            scene = re.sub(
                rf"(?<![\w@]){profile_pattern}{trailing_punctuation}",
                name,
                scene,
                flags=re.IGNORECASE,
            )

        scene = re.sub(rf"\b{re.escape(name)}\s*,\s*{re.escape(name)}\b", name, scene, flags=re.IGNORECASE)
        scene = re.sub(
            rf"\b{re.escape(name)}\s*,\s*(?=(?:{action_pattern})\b)",
            f"{name} ",
            scene,
            flags=re.IGNORECASE,
        )

    scene = re.sub(rf"\b(and\s+[\wÀ-ỹ]+)\s*,\s*(?=(?:{action_pattern})\b)", r"\1 ", scene, flags=re.IGNORECASE)
    scene = re.sub(r"\s+", " ", scene).strip()
    scene = re.sub(r"\s+([,.;:])", r"\1", scene)
    scene = re.sub(r",\s*,+", ", ", scene)
    return scene


def frame_has_person_cue(frame):
    text = json.dumps(frame, ensure_ascii=False).casefold()
    cues = [
        "dialogue", "speaker", "character", "protagonist", "hero", "team",
        "person", "people", "face", "portrait", "man", "woman", "boy", "girl",
        "anh ", "chị ", "cô ", "cậu ", "nhân vật",
    ]
    return any(cue in text for cue in cues) or re.search(r"\b(he|she|they)\b", text) is not None


def fallback_character_records(frame, characters):
    if not characters:
        return []
    if frame_has_person_cue(frame):
        return [characters[0]]
    return []


def build_character_lock(characters, description_limit=185):
    if not characters:
        return ""
    parts = []
    for character in characters:
        name = str(character.get("name") or "").strip()
        description = compact_character_description(character.get("description", ""), description_limit)
        if name and description:
            parts.append(f"{name}: {description}")
    if not parts:
        return ""
    return "CHARACTER CONTINUITY: keep recurring faces/outfits stable; do not merge identities. " + "; ".join(parts) + "."


def build_style_lock(config_path="series_config.json"):
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config_data = json.load(f)
                custom_lock = config_data.get("style_lock", "").strip()
                if custom_lock:
                    return custom_lock
        except Exception:
            pass
    return STYLE_LOCK


def trim_to_word_boundary(value, limit):
    value = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(value) <= limit:
        return value
    if limit <= 3:
        return value[:limit]
    trimmed = value[:limit].rsplit(" ", 1)[0].rstrip(" ,.;:")
    return trimmed or value[:limit].rstrip(" ,.;:")


def split_style_suffix(prompt, style_suffix=""):
    prompt = strip_prompt_scaffold(prompt)
    style_suffix = str(style_suffix or "").strip()
    
    # Strip any trailing bracketed suffix like [, ... --ar 4:3] or [, ...]
    prompt = re.sub(r"\s*\[,?[^\]]*--ar\s+\d+:\d+\]\s*$", "", prompt).strip()
    prompt = re.sub(r"\s*\[,?[^\]]*\]\s*$", "", prompt).strip()
    
    # Also strip the cleaned style suffix if it ends the prompt
    clean_suffix = re.sub(r"^\[,?\s*", "", style_suffix).replace("]", "").strip()
    clean_suffix = re.sub(r"--ar\s+\d+:\d+", "", clean_suffix).strip()
    clean_suffix = clean_suffix.rstrip(" ,")
    if clean_suffix and prompt.endswith(clean_suffix):
        prompt = prompt[:-len(clean_suffix)].strip()
        prompt = prompt.rstrip(" ,")

    suffix_markers = [
        " in a vibrant graphic novel style",
        " [, high-quality",
        "[, high-quality",
        " high-quality graphic novel illustration",
        " [, rough black-and-white indie comic",
        "[, rough black-and-white indie comic",
    ]
    legacy_index = -1
    for marker in suffix_markers:
        index = prompt.rfind(marker)
        if index > legacy_index:
            legacy_index = index
    if legacy_index > 0:
        prompt = prompt[:legacy_index].strip()
    suffix = style_suffix.strip() if style_suffix else ""
    return prompt.strip(), suffix


def _ensure_scene_ends_cleanly(scene_part):
    """Ensure a SCENE: text ends with sentence-closing punctuation before appending style/char locks."""
    if not scene_part:
        return scene_part
    stripped = scene_part.rstrip()
    if stripped and stripped[-1] not in ('.', '!', '?', ';', ':'):
        return stripped + '.'
    return stripped


def fit_image_prompt(prompt, limit=980, characters=None, style_suffix="", config_path="series_config.json"):
    prompt = str(prompt or "").strip()
    characters = characters or []
    scene, suffix = split_style_suffix(prompt, style_suffix)
    scene = remove_redundant_character_descriptions(scene, characters)
    if load_style_reference_image(config_path):
        # Even when using a style reference image, we MUST enforce layout constraints in text.
        # This keeps characters framed with borders and leaves top space clear for overlay dialogue.
        style_lock = "characters fully framed within the panel, leaving a wide 15% margin of empty space around the borders. Leave the top 25% of the frame completely clear of character faces and heads as empty white space for text labels, keeping character faces centered in the lower-middle section."
    else:
        style_lock = build_style_lock(config_path)

    # Put the unique scene first. Image models overweight early tokens, and
    # identical front-loaded locks make episodes visually collapse together.
    # Always close the scene with punctuation so style/char locks don't bleed into it.
    for description_limit in (170, 135, 105, _CHAR_DESC_MIN_LIMIT):
        lock = build_character_lock(characters, description_limit)
        fixed = " ".join(item for item in (style_lock, lock, suffix) if item).strip()
        fixed_len = len(fixed) + len("SCENE: ") + (1 if fixed and scene else 0)
        scene_limit = max(260, limit - fixed_len)
        compact_scene = trim_to_word_boundary(scene, scene_limit)
        scene_part = _ensure_scene_ends_cleanly(f"SCENE: {compact_scene}") if compact_scene else ""
        parts = [item for item in (scene_part, style_lock, lock, suffix) if item]
        compact = " ".join(parts).strip()
        if len(compact) <= limit:
            # Warn if the scene was truncated significantly
            if compact_scene and len(compact_scene) < _SCENE_TRUNCATION_WARN_THRESHOLD:
                print(
                    f"[fit_image_prompt] WARNING: scene truncated to {len(compact_scene)} chars "
                    f"(threshold {_SCENE_TRUNCATION_WARN_THRESHOLD}). "
                    f"Character desc limit used: {description_limit}."
                )
            return compact

    # Last resort: use minimum character desc floor with explicit warning
    lock = build_character_lock(characters, _CHAR_DESC_MIN_LIMIT)
    suffix_budget = len(suffix) + 1 if suffix else 0
    lock_budget = len(" ".join(item for item in (style_lock, lock) if item)) + 1
    scene_limit = max(160, limit - suffix_budget - lock_budget - len("SCENE: "))
    compact_scene = trim_to_word_boundary(scene, scene_limit)
    scene_part = _ensure_scene_ends_cleanly(f"SCENE: {compact_scene}") if compact_scene else ""
    parts = [item for item in (scene_part, style_lock, lock, suffix) if item]
    compact = " ".join(parts).strip()
    print(
        f"[fit_image_prompt] WARNING: using last-resort truncation. "
        f"Scene={len(compact_scene)} chars, char desc floored at {_CHAR_DESC_MIN_LIMIT}."
    )
    if len(compact) <= limit:
        return compact

    if suffix:
        available = max(0, limit - len(suffix) - 1)
        prefix = " ".join(item for item in (scene_part, style_lock, lock) if item)
        return f"{trim_to_word_boundary(prefix, available)} {suffix}".strip()
    return trim_to_word_boundary(compact, limit)


def episode_context_text(payload):
    if not isinstance(payload, dict):
        return ""
    chunks = [
        payload.get("topic", ""),
        payload.get("prompt_text", ""),
        payload.get("episode_title", ""),
        payload.get("tutorial_summary", ""),
        payload.get("caption_post", ""),
    ]
    return "\n".join(str(item or "") for item in chunks)


def select_frame_characters(frame, characters, extra_text=""):
    visible = visible_character_records(frame, characters)
    if visible:
        return visible
    mentioned = visible_character_records(frame, characters, extra_text=extra_text)
    if mentioned:
        return mentioned
    fallback = fallback_character_records(frame, characters)
    if fallback:
        return fallback
    if characters and extra_text:
        primary = characters[0]
        primary_name = str(primary.get("name") or "").strip()
        if primary_name and text_mentions_name(extra_text, primary_name):
            return [primary]
    return []


def prepare_frame_image_prompt(frame, visual_config=None, extra_text="", limit=980, screen_allowed=True, variety_directive=""):
    visual_config = visual_config or get_series_visual_config()
    characters = visual_config.get("characters", [])
    visible_characters = select_frame_characters(frame, characters, extra_text)
    source_prompt = frame.get("raw_image_generation_prompt") or frame.get("image_generation_prompt", "")
    if not screen_allowed:
        source_prompt = deemphasize_screen_focus(source_prompt)
    if variety_directive:
        source_prompt = f"{source_prompt} {variety_directive}"
    return fit_image_prompt(
        source_prompt,
        limit=limit,
        characters=visible_characters,
        style_suffix=visual_config.get("master_style_suffix", ""),
    )


_VIET_CHARS = re.compile(
    r'[\u00c0-\u024f\u1e00-\u1eff]',  # Latin Extended / Latin Extended Additional (covers tones)
    re.IGNORECASE
)


def _is_vietnamese(text):
    """Heuristic: text contains Vietnamese diacritical characters."""
    return bool(_VIET_CHARS.search(str(text or '')))


def _normalize_overlay_language(frames, comic_language='vn'):
    """
    Post-processing: if comic_language is Vietnamese but the model wrote English
    in text_overlays[].text, replace it with text_overlay_vietnamese so the
    rendered panel shows the correct language.
    Also enforces minimum meaningful length — if both texts are too short,
    concatenate them into one richer overlay.
    """
    if comic_language != 'vn':
        return frames
    for frame in (frames or []):
        if not isinstance(frame, dict):
            continue
        viet_fallback = str(frame.get('text_overlay_vietnamese') or '').strip()
        overlays = frame.get('text_overlays') or []
        for overlay in overlays:
            if not isinstance(overlay, dict):
                continue
            txt = str(overlay.get('text') or '').strip()
            if not txt:
                if viet_fallback:
                    overlay['text'] = viet_fallback
                continue
            # If overlay text has no Vietnamese characters but fallback does, prefer fallback
            if not _is_vietnamese(txt) and _is_vietnamese(viet_fallback):
                overlay['text'] = viet_fallback
            elif viet_fallback and txt != viet_fallback:
                # Both Vietnamese, but overlay is much shorter — enrich it
                overlay_words = re.findall(r'\b\w+\b', txt, re.UNICODE)
                fallback_words = re.findall(r'\b\w+\b', viet_fallback, re.UNICODE)
                if len(overlay_words) < 7 and len(fallback_words) > len(overlay_words):
                    overlay['text'] = viet_fallback
    return frames


def prepare_episode_payload_for_generation(payload, config_path="series_config.json"):
    if not isinstance(payload, dict):
        return payload
    visual_config = get_series_visual_config(config_path)
    extra_text = episode_context_text(payload)
    frames = [frame for frame in (payload.get("frames", []) or []) if isinstance(frame, dict)]
    allowed_screen_index = choose_allowed_screen_frame(frames)
    frame_count = parse_frame_count(payload.get("frame_count") or len(frames))
    comic_language = str(payload.get("comic_language") or DEFAULT_COMIC_LANGUAGE).strip().lower()
    # Infer from series config if not in payload
    if not comic_language or comic_language not in ('vn', 'en'):
        try:
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as _f:
                    comic_language = str(json.load(_f).get('comic_language') or DEFAULT_COMIC_LANGUAGE).strip().lower()
        except Exception:
            comic_language = DEFAULT_COMIC_LANGUAGE
    for index, frame in enumerate(frames):
        if not isinstance(frame, dict):
            continue
        original_prompt = frame.get("raw_image_generation_prompt") or frame.get("image_generation_prompt", "")
        screen_allowed = index == allowed_screen_index
        directive = visual_variety_directive(index + 1, frame_count, screen_allowed=screen_allowed)
        prepared_prompt = prepare_frame_image_prompt(frame, visual_config, extra_text, screen_allowed=screen_allowed, variety_directive=directive)
        if prepared_prompt:
            frame["image_generation_prompt"] = prepared_prompt
            frame["raw_image_generation_prompt"] = strip_prompt_scaffold(original_prompt)
    # Normalize overlay language: replace English overlays with Vietnamese fallback
    payload["frames"] = _normalize_overlay_language(frames, comic_language)
    return payload


def call_gemini_with_retry(client, model, contents, config=None, max_retries=5, initial_delay=5):
    import time
    delay = initial_delay
    for attempt in range(max_retries):
        try:
            if config:
                return client.models.generate_content(model=model, contents=contents, config=config)
            else:
                return client.models.generate_content(model=model, contents=contents)
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                print(f"[Gemini Retry] Rate limited (429). Retrying in {delay}s... (Attempt {attempt + 1}/{max_retries})")
                time.sleep(delay)
                delay *= 2
            else:
                raise e
    # Final attempt
    if config:
        return client.models.generate_content(model=model, contents=contents, config=config)
    else:
        return client.models.generate_content(model=model, contents=contents)


def clean_reference_image(image_path):
    """
    Analyzes the uploaded reference image using Gemini Vision to detect any text blocks,
    annotations, labels, speech bubbles, or watermark badges (like 'Save' Pinterest buttons).
    If text/buttons are found, they are programmatically painted over with the surrounding
    or dominant background color to prevent style-ref or continuity noise.

    Requires Pillow: pip install Pillow
    """
    # Guard: check Pillow is available before doing anything
    try:
        from PIL import Image, ImageDraw
        import io as _io
    except ImportError:
        print(
            "⚠️  clean_reference_image: Pillow is not installed — skipping clean pass.\n"
            "    Install it with:  pip install Pillow"
        )
        return

    from google.genai import types as _genai_types

    if not os.path.exists(image_path):
        print(f"⚠️  clean_reference_image: file not found: {image_path}")
        return

    print(f"--- Running Cleaning Pass on reference: {image_path} ---")
    try:
        # Load and normalise to RGB so drawing and saving are consistent
        img = Image.open(image_path).convert("RGB")
        width, height = img.size

        # Render the normalised image to bytes for Gemini (use PNG for lossless round-trip)
        buf = _io.BytesIO()
        img.save(buf, format="PNG")
        img_bytes = buf.getvalue()

        client = genai.Client()
        prompt = (
            "Please analyze this reference drawing or character portrait. "
            "Identify all bounding boxes for any text elements, speech bubbles, text captions, labels, "
            "Pinterest 'Save' badges, or watermark badges in the image. "
            "For each detected element, return its box in normalized coordinates [ymin, xmin, ymax, xmax] "
            "on a 0-1000 scale (where 0,0 is the top-left and 1000,1000 is the bottom-right).\n\n"
            "Return the coordinates as a JSON list of lists.\n"
            "Example format:\n"
            "[\n"
            "  [120, 450, 180, 520],\n"
            "  [800, 10, 850, 100]\n"
            "]\n"
            "If no text, labels, speech bubbles, or badges are present, return an empty list: []\n"
            "Do not include any other text in your response."
        )

        response = call_gemini_with_retry(
            client=client,
            model=GEMINI_MODELS[0],
            contents=[
                _genai_types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                prompt,
            ],
            config={"response_mime_type": "application/json"},
        )

        try:
            boxes = json.loads(response.text.strip())
        except Exception:
            print(f" -> Could not parse Gemini response as JSON: {response.text[:200]}")
            return

        if not boxes:
            print(" -> No text residues or badges found. Reference is clean.")
            return

        print(f" -> Detected {len(boxes)} text/badge region(s) to clean.")
        draw = ImageDraw.Draw(img)

        for box in boxes:
            if not isinstance(box, (list, tuple)) or len(box) != 4:
                continue
            ymin, xmin, ymax, xmax = box

            y1 = int(ymin * height / 1000.0)
            x1 = int(xmin * width / 1000.0)
            y2 = int(ymax * height / 1000.0)
            x2 = int(xmax * width / 1000.0)

            # Clamp coordinates
            x1 = max(0, min(width - 1, x1))
            y1 = max(0, min(height - 1, y1))
            x2 = max(x1 + 1, min(width, x2))
            y2 = max(y1 + 1, min(height, y2))

            # Determine dominant color around the box to blend in seamlessly
            pixels = []
            border = 3
            for x in range(max(0, x1 - border), min(width, x2 + border)):
                if y1 - 1 >= 0:
                    pixels.append(img.getpixel((x, y1 - 1)))
                if y2 + 1 < height:
                    pixels.append(img.getpixel((x, y2 + 1)))
            for y in range(max(0, y1 - border), min(height, y2 + border)):
                if x1 - 1 >= 0:
                    pixels.append(img.getpixel((x1 - 1, y)))
                if x2 + 1 < width:
                    pixels.append(img.getpixel((x2 + 1, y)))

            if pixels:
                avg_color = tuple(int(sum(ch) / len(pixels)) for ch in zip(*pixels))
            else:
                avg_color = (255, 255, 255)

            draw.rectangle([x1, y1, x2, y2], fill=avg_color)

        # Always save as PNG for lossless inpainting quality
        output_path = os.path.splitext(image_path)[0] + ".png"
        img.save(output_path, format="PNG")
        # If input was a different extension, remove the original to avoid stale files
        if output_path != image_path and os.path.exists(image_path):
            try:
                os.remove(image_path)
            except Exception:
                pass
        print(f" -> Successfully saved cleaned version of: {output_path}")
    except Exception as e:
        print(f"⚠️  Error cleaning reference image {image_path}: {e}")


def create_clean_reference_variant(image_path, asset_name="", asset_description=""):
    """
    Generates a clean reference image variant from an existing reference image.
    Uses the configured image generator backend to perform image-to-image or guided generation.
    Saves the output as asset_name_clean.png and returns the path to the saved image.
    """
    import os
    import config

    backend = getattr(config, "IMAGE_GENERATOR_BACKEND", "recraft").strip().lower()

    if backend == "openai":
        from openai_helper import OpenAIHelper
        image_generator = OpenAIHelper()
    elif backend == "bearer":
        from bearer_gpt_image2_helper import BearerGPTImage2Helper
        image_generator = BearerGPTImage2Helper()
    elif backend == "venice":
        from venice_helper import VeniceHelper
        image_generator = VeniceHelper()
    else:
        from recraft_helper import RecraftHelper
        image_generator = RecraftHelper()

    visual_description = ""
    if image_path and os.path.exists(image_path) and not os.environ.get("BYPASS_VISION_FOR_CLEAN_REF"):
        try:
            from PIL import Image
            import io as _io
            from google import genai
            from google.genai import types as _genai_types

            client = genai.Client()
            img = Image.open(image_path).convert("RGB")
            buf = _io.BytesIO()
            img.save(buf, format="PNG")
            img_bytes = buf.getvalue()

            vision_prompt = (
                f"Analyze this reference drawing or image for '{asset_name}'. "
                "Describe the subject's physical appearance and art style in precise detail. "
                "Focus on the exact visual features (head shape, eyes, body proportions, clothing, skin color) "
                "and the artistic medium (e.g. black-and-white hand-drawn ink lines, doodle). "
                "Describe the character's pose in a way that displays all features and details clearly without hiding or obscuring any parts.\n"
                "CRITICAL: Ignore and do not mention any text, labels, annotations, speech bubbles, background noise, or border frames in the image.\n"
                "Write a single concise paragraph of under 100 words. Focus strictly on describing the subject's visual attributes."
            )

            model_name = GEMINI_MODELS[0] if 'GEMINI_MODELS' in globals() else "gemini-2.5-flash"
            print(f"[Clean Reference] Analyzing source image {image_path} using {model_name}...")
            response = call_gemini_with_retry(
                client=client,
                model=model_name,
                contents=[
                    _genai_types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                    vision_prompt,
                ]
            )
            if response and response.text:
                visual_description = response.text.strip()
                print(f"[Clean Reference] Gemini Vision Description: {visual_description}")
        except Exception as e_vision:
            print(f"[Clean Reference] Gemini Vision analysis failed: {e_vision}")

    sanitized_name = asset_name
    if sanitized_name.lower() == "freaky":
        sanitized_name = "the protagonist"

    # Load and describe the style reference if it exists
    style_description = ""
    try:
        style_ref_path = load_style_reference_image()
        if style_ref_path and os.path.exists(style_ref_path) and not os.environ.get("BYPASS_VISION_FOR_CLEAN_REF"):
            from PIL import Image
            import io as _io
            from google import genai
            from google.genai import types as _genai_types

            client = genai.Client()
            img_style = Image.open(style_ref_path).convert("RGB")
            buf_style = _io.BytesIO()
            img_style.save(buf_style, format="PNG")
            img_style_bytes = buf_style.getvalue()

            style_prompt = (
                "Analyze this style reference drawing or comic panel. "
                "Describe the overall artistic style in detail, focusing on:\n"
                "- Line quality (e.g. thick/thin, rough, wobbly, hand-drawn ink lines)\n"
                "- Shading/coloring (e.g. black-and-white, monochrome, minimal flat colors, no shading)\n"
                "- Textures and rendering (e.g. zine style, paper texture, rough drawing)\n"
                "Write a single concise paragraph of under 80 words. Focus only on describing the style attributes."
            )

            model_name = GEMINI_MODELS[0] if 'GEMINI_MODELS' in globals() else "gemini-2.5-flash"
            print(f"[Clean Reference] Analyzing style reference {style_ref_path} using {model_name}...")
            style_resp = call_gemini_with_retry(
                client=client,
                model=model_name,
                contents=[
                    _genai_types.Part.from_bytes(data=img_style_bytes, mime_type="image/png"),
                    style_prompt,
                ]
            )
            if style_resp and style_resp.text:
                style_description = style_resp.text.strip()
                print(f"[Clean Reference] Gemini Style Description: {style_description}")
    except Exception as e_style:
        print(f"[Clean Reference] Style analysis failed: {e_style}")

    # Sanitize descriptions to avoid triggering NSFW filters on 'freaky'
    import re
    cleaned_visual_desc = re.sub(r'\bfreaky\b', 'quirky', visual_description, flags=re.IGNORECASE)
    cleaned_asset_desc = re.sub(r'\bfreaky\b', 'quirky', asset_description, flags=re.IGNORECASE)

    combined_desc = ""
    if cleaned_visual_desc:
        combined_desc += f"{cleaned_visual_desc} "
    if cleaned_asset_desc:
        combined_desc += f"{cleaned_asset_desc} "
    if style_description:
        combined_desc += f"The art style must match: {style_description}"

    # Limit description length to ensure we stay under the 1500 limit of surplusintelligence.ai
    if len(combined_desc) > 850:
        combined_desc = combined_desc[:850] + "..."

    prompt = (
        f"Create a canonical clean character reference for {sanitized_name or 'the character'}. "
        f"The subject must be shown in a clear pose that does not hide details, fully visible, standing centered on a plain solid white background. "
        f"There must be absolutely no text, no labels, no speech bubbles, no annotations, and no noisy background or textured backdrop. "
        f"Preserve the exact identity-defining traits and art style."
    )
    if combined_desc:
        prompt += f" Details: {combined_desc}"

    has_ref_support = hasattr(image_generator, "generate_image_from_reference")
    if hasattr(image_generator, "supports_reference_image"):
        has_ref_support = has_ref_support and image_generator.supports_reference_image()

    print(f"[Clean Reference] Generating clean variant for {asset_name} using {backend}...")
    if has_ref_support:
        try:
            import inspect
            sig = inspect.signature(image_generator.generate_image_from_reference)
            params = sig.parameters

            kwargs = {}
            if "reference_image_path" in params:
                kwargs["reference_image_path"] = image_path
            else:
                kwargs["reference_path"] = image_path

            if "aspect_ratio" in params:
                kwargs["aspect_ratio"] = "1:1"

            if "strength" in params:
                kwargs["strength"] = 0.35

            image_bytes = image_generator.generate_image_from_reference(prompt, **kwargs)
        except Exception as e:
            print(f"[Clean Reference] Image-to-image failed: {e}. Falling back to text-to-image.")
            image_bytes = image_generator.generate_image(prompt, aspect_ratio="1:1")
    else:
        image_bytes = image_generator.generate_image(prompt, aspect_ratio="1:1")

    base, _ = os.path.splitext(image_path)
    output_path = base + ".png" if base.endswith("_clean") else base + "_clean.png"

    with open(output_path, "wb") as f:
        f.write(image_bytes)

    try:
        clean_reference_image(output_path)
    except Exception as e_clean:
        print(f"[Clean Reference] Pillow clean pass on generated ref failed: {e_clean}")

    print(f"[Clean Reference] ✅ Saved clean reference to {output_path}")
    return output_path


def local_ref_path(ref_path):
    raw_path = str(ref_path or "").split("?", 1)[0].lstrip("/\\")
    if not raw_path:
        return ""
    local_path = os.path.normpath(raw_path)
    if os.path.isabs(local_path) or local_path.startswith(".."):
        return ""
    return local_path if os.path.exists(local_path) else ""


def load_style_reference_image(config_path="series_config.json"):
    env_path = local_ref_path(os.environ.get("RECRAFT_STYLE_REFERENCE_PATH", ""))
    if env_path:
        return env_path

    if not os.path.exists(config_path):
        return ""
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = json.load(f)
    except Exception as e:
        print(f"Error loading style reference image config: {e}")
        return ""

    return local_ref_path(config_data.get("style_reference_path", ""))


def reference_images_for_character(character_name):
    if not character_name:
        return []
    try:
        from series_db import load_database
        db = load_database(rebuild=True)
    except Exception as e:
        print(f"Error loading reference database: {e}")
        return []

    matches = []
    for record in db.get("characters", []):
        if str(record.get("name") or "").casefold() != str(character_name).casefold():
            continue
        for ref in record.get("image_refs", []) or []:
            local_path = local_ref_path(ref.get("path"))
            if not local_path:
                continue
            matches.append({
                "path": local_path,
                "source": ref.get("source", ""),
                "episode_number": ref.get("episode_number") or 0,
                "frame_number": ref.get("frame_number") or 0,
            })
    matches.sort(key=lambda item: (
        item.get("source") != "input",
        -int(item.get("episode_number") or 0),
        -int(item.get("frame_number") or 0),
    ))
    return matches


def parse_episode_panel_path(path):
    match = re.search(r"episode_(\d+)_panels[\\/]+panel_(\d+)\.png$", str(path or ""))
    if not match:
        return 0, 0
    return int(match.group(1)), int(match.group(2))


def reference_rank(ref, target_episode=0, target_frame=0):
    if ref.get("source") == "input":
        return (0, 0, 0)

    episode = int(ref.get("episode_number") or 0)
    frame = int(ref.get("frame_number") or 0)
    if target_episode and episode == target_episode and target_frame and 0 < frame < target_frame:
        return (1, target_frame - frame, 0)
    if target_episode and episode and episode < target_episode:
        return (2, target_episode - episode, -frame)
    if target_episode and episode == target_episode and frame > target_frame:
        return (3, frame - target_frame, 0)
    if episode:
        return (4, -episode, -frame)
    return (5, 0, 0)


def choose_reference_image(visible_characters, output_filename=""):
    flag = os.environ.get("RECRAFT_USE_REFERENCE_IMAGES", "episode").strip().casefold()
    if not flag:
        flag = "episode"
    if flag in {"0", "false", "no", "off"}:
        return "", ""
    input_only = flag not in {"1", "true", "yes", "on", "all", "episode"}

    # Do not return style_reference here because it is a global style constraint,
    # not a character/asset continuity reference.
    pass

    names = [str(item.get("name") or "").strip() for item in visible_characters if item.get("name")]
    if not names:
        return "", ""

    output_norm = os.path.normcase(os.path.normpath(output_filename)) if output_filename else ""
    target_episode, target_frame = parse_episode_panel_path(output_filename)
    options_by_name = {}
    for name in names:
        options = [
            ref for ref in reference_images_for_character(name)
            if not output_norm or os.path.normcase(os.path.normpath(ref.get("path", ""))) != output_norm
        ]
        if input_only:
            options = [ref for ref in options if ref.get("source") == "input"]
        options.sort(key=lambda ref: reference_rank(ref, target_episode, target_frame))
        if options:
            options_by_name[name] = options

    if not options_by_name:
        return "", ""

    if len(names) == 1:
        best_ref = options_by_name.get(names[0], [{}])[0]
        return best_ref.get("path", ""), best_ref.get("source", "")

    path_sets = [set(ref.get("path") for ref in options_by_name.get(name, [])) for name in names]
    if len(path_sets) != len(names) or not all(path_sets):
        return "", ""
    shared_paths = set.intersection(*path_sets)
    if not shared_paths:
        return "", ""

    shared_options = [
        ref
        for options in options_by_name.values()
        for ref in options
        if ref.get("path") in shared_paths
    ]
    shared_options.sort(key=lambda item: reference_rank(item, target_episode, target_frame))
    if shared_options:
        return shared_options[0].get("path", ""), shared_options[0].get("source", "")
    return "", ""


def reposition_overlays_using_vision(payload: dict, panels_dir: str):
    """
    Multimodal visual pass: analyzes generated panel images using Gemini Vision
    to select overlay positions (top-left, top-right, bottom-left, bottom-right)
    that avoid covering characters' faces, heads, bodies, or main actions.
    """
    import os
    import json
    from google import genai
    from google.genai import types

    client = genai.Client()
    frames = payload.get("frames", [])
    if not frames:
        return payload

    print("\n--- Visual Post-Processing: Optimizing speech bubble / overlay placements ---")
    modified = False

    for i, frame in enumerate(frames):
        frame_num = frame.get("frame_number", i + 1)
        filename = os.path.join(panels_dir, f"panel_{frame_num}.png")
        if not os.path.exists(filename):
            continue

        text_overlays = frame.get("text_overlays", [])
        viet_text = frame.get("text_overlay_vietnamese")
        
        # If there is nothing to place, skip
        if not text_overlays and not viet_text:
            continue

        # Prepare list of overlay items for Gemini to review
        items_to_place = []
        if text_overlays:
            for idx, overlay in enumerate(text_overlays):
                items_to_place.append({
                    "id": idx,
                    "type": overlay.get("type", "dialogue"),
                    "character": overlay.get("character", ""),
                    "text": overlay.get("text", ""),
                    "current_position": overlay.get("position", "bottom-left")
                })
        elif viet_text:
            has_dialogue = ":" in viet_text
            items_to_place.append({
                "id": 0,
                "type": "dialogue" if has_dialogue else "narration",
                "character": viet_text.split(":", 1)[0] if has_dialogue else "",
                "text": viet_text,
                "current_position": "bottom-left"
            })

        # Ask Gemini to check the image and place the overlays
        prompt = (
            "We are placing speech bubbles / narration text overlay boxes on this comic panel image.\n"
            "Here are the text items we need to place on the image:\n"
            f"{json.dumps(items_to_place, ensure_ascii=False, indent=2)}\n\n"
            "Please analyze the composition of the image. Identify the positions of:\n"
            "1. Character heads, faces, eyes, and bodies.\n"
            "2. The main action or key objects (e.g. coffee cups, computers, doors, windows, signs).\n\n"
            "Select the best position (from: 'top-left', 'top-right', 'bottom-left', 'bottom-right') for each item "
            "so that the text box does NOT overlap/cover any character faces, heads, bodies, or the main action/objects. "
            "Leave enough breathing room around characters. Prefer placing bubbles in empty background space.\n\n"
            "Return the optimized positions as a JSON object mapping the item's 'id' integer (as key) to the chosen position string.\n"
            "Example return format:\n"
            "{\n"
            "  \"0\": \"top-right\",\n"
            "  \"1\": \"bottom-left\"\n"
            "}\n"
            "Do not include any other text."
        )

        try:
            print(f"Analyzing panel {frame_num} image with Gemini Vision to avoid overlay overlap...")
            with open(filename, "rb") as img_f:
                img_bytes = img_f.read()

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                    prompt
                ],
                config={"response_mime_type": "application/json"}
            )
            positions = json.loads(response.text.strip())
            
            # Apply optimized positions
            for key, val in positions.items():
                idx = int(key)
                pos = str(val).strip().lower()
                if pos not in ("top-left", "top-right", "bottom-left", "bottom-right"):
                    continue

                if text_overlays and idx < len(text_overlays):
                    old_pos = text_overlays[idx].get("position")
                    if old_pos != pos:
                        print(f" -> Moved panel {frame_num} item {idx} ('{text_overlays[idx]['text'][:30]}...') from {old_pos} to {pos} to avoid cover")
                        text_overlays[idx]["position"] = pos
                        modified = True
                elif viet_text and idx == 0:
                    print(f" -> Legacy text overlay for panel {frame_num} moved to {pos}. Converting to structured overlay.")
                    has_dialogue = ":" in viet_text
                    frame["text_overlays"] = [{
                        "type": "dialogue" if has_dialogue else "narration",
                        "character": viet_text.split(":", 1)[0].strip() if has_dialogue else "",
                        "text": viet_text.split(":", 1)[1].strip() if has_dialogue else viet_text,
                        "position": pos
                    }]
                    # Clear legacy text_overlay_vietnamese to let the structured renderer run
                    frame["text_overlay_vietnamese"] = None
                    modified = True
        except Exception as e:
            print(f"⚠️ Vision post-processing failed for panel {frame_num}: {e}")

    if modified:
        print("Saving updated episode JSON with optimized bubble positions...")
        save_episode(payload)
        try:
            from series_db import record_episode_payload
            record_episode_payload(payload, payload.get("topic", ""))
        except Exception as e_db:
            print(f"⚠️ Failed to update database with new positions: {e_db}")

    return payload


def generate_panels_for_episode(payload: dict, character_seed: int = DEFAULT_CHARACTER_SEED, progress_callback=None):
    """
    Generates panel images for every frame in the episode using the configured
    image-generation backend (Recraft, Venice/Flux, OpenAI, etc.).

    Args:
        payload:        The episode JSON payload from Gemini (any frame count).
        character_seed: Base seed used for frames where the protagonist appears,
                        improving character consistency across panels.
        progress_callback: Optional callable(current_panel, total_panels, done=False)
                           invoked after each panel is attempted.
    """
    ep_num = payload.get("episode_number", 1)
    panels_dir = f"episode_{ep_num}_panels"
    os.makedirs(panels_dir, exist_ok=True)

    # Initialize the selected generator backend
    backend = getattr(config, "IMAGE_GENERATOR_BACKEND", "recraft").strip().lower()
    if backend == "openai":
        from openai_helper import OpenAIHelper
        image_generator = OpenAIHelper()
        backend_name = f"OpenAI ({getattr(image_generator, 'model', 'gpt-image-1')})"
    elif backend == "venice":
        image_generator = VeniceHelper()
        backend_name = "Venice AI"
    elif backend == "bearer":
        from bearer_gpt_image2_helper import BearerGPTImage2Helper
        image_generator = BearerGPTImage2Helper()
        backend_name = f"Bearer GPT ({getattr(image_generator, 'model', 'gpt-image-2')})"
    else:  # default: recraft
        image_generator = RecraftHelper()
        backend_name = f"Recraft ({getattr(image_generator, 'model', 'image model')})"

    visual_config = get_series_visual_config()
    characters = visual_config.get("characters", [])
    primary_character = get_primary_character_config()
    protagonist_name = primary_character.get("name", "")
    ref_face = primary_character.get("ref_path", "")
    extra_text = episode_context_text(payload)
    protagonist_requested = text_mentions_name(extra_text, protagonist_name) if protagonist_name else False

    style_ref_path = load_style_reference_image()
    style_id = ""
    if style_ref_path and hasattr(image_generator, "get_style_id"):
        style_id = image_generator.get_style_id(style_ref_path)

    for i, frame in enumerate(payload.get("frames", [])):
        if progress_callback:
            try:
                progress_callback(i, len(payload.get('frames', [])))
            except Exception as e_cb:
                print(f"Error calling progress callback: {e_cb}")
        raw_prompt = frame.get("image_generation_prompt", "")
        visible_characters = select_frame_characters(frame, characters, extra_text)
        if protagonist_requested and protagonist_name and not any(str(c.get("name") or "").casefold() == protagonist_name.casefold() for c in visible_characters):
            for candidate in characters:
                if str(candidate.get("name") or "").casefold() == protagonist_name.casefold():
                    visible_characters = [candidate] + [c for c in visible_characters if str(c.get("name") or "").casefold() != protagonist_name.casefold()]
                    break
        prompt = fit_image_prompt(raw_prompt, characters=visible_characters, style_suffix=visual_config.get("master_style_suffix", ""))
        frame_num = frame.get("frame_number", i + 1)
        filename = os.path.join(panels_dir, f"panel_{frame_num}.png")

        # Skip already-generated panels to prevent double billing
        if os.path.exists(filename):
            print(f"Panel {frame_num} already exists, skipping generation.")
            continue

        character_visible = any(str(c.get("name") or "").casefold() == protagonist_name.casefold() for c in visible_characters) if protagonist_name else False
        seed = stable_seed_for_characters(visible_characters, character_seed)
        seed_label = f"seed={seed}" if seed >= 0 else "random seed"
        if len(str(raw_prompt or "")) != len(prompt):
            print(f"Trimmed panel {frame_num} prompt from {len(str(raw_prompt or ''))} to {len(prompt)} chars for image API limit.")
        print(f"Generating panel {frame_num}/{len(payload.get('frames', []))} using {backend_name} ({seed_label})...")

        try:
            reference_image, ref_source = choose_reference_image(visible_characters, filename)
            can_use_reference = bool(reference_image and hasattr(image_generator, "generate_image_from_reference"))
            if reference_image and not can_use_reference:
                print(f"Reference image selected for panel {frame_num} but backend does not support image-to-image: {reference_image}")
            if can_use_reference:
                # Lower structural strength for tight input face crops to prevent zooming/cropping the scene.
                # Use default strength for previous panels to preserve layout continuity.
                strength = 0.15 if ref_source == "input" else None
                print(f"Using continuity reference for panel {frame_num}: {reference_image} (source: {ref_source}, strength: {strength or 'default'})")
                if style_id:
                    image_bytes = image_generator.generate_image_from_reference(prompt, reference_image, aspect_ratio="4:3", seed=seed, style_id=style_id, strength=strength)
                else:
                    image_bytes = image_generator.generate_image_from_reference(prompt, reference_image, aspect_ratio="4:3", seed=seed, strength=strength)
            else:
                if style_id:
                    image_bytes = image_generator.generate_image(prompt, aspect_ratio="4:3", seed=seed, style_id=style_id)
                else:
                    image_bytes = image_generator.generate_image(prompt, aspect_ratio="4:3", seed=seed)
            with open(filename, "wb") as f:
                f.write(image_bytes)
            print(f"✅ Saved {filename}")
            
            just_created_ref = False
            if character_visible and ref_face and not os.path.exists(ref_face) and F2F_AVAILABLE:
                try:
                    import shutil
                    shutil.copy(filename, ref_face)
                    just_created_ref = True
                    print(f"Generated first appearance of character '{protagonist_name}'. Saved panel as character face reference to: {ref_face}")
                    try:
                        from series_db import rebuild_database_from_files
                        rebuild_database_from_files()
                    except Exception as e_db:
                        print(f"⚠️ Failed to rebuild series database: {e_db}")
                except Exception as e:
                    print(f"⚠️ Failed to copy first appearance to reference face: {e}")

            # Optional post-processing: face swap only when a user/series reference exists.
            if character_visible and ref_face and not just_created_ref:
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

    # Multimodal post-processing: reposition bubbles dynamically using vision
    try:
        reposition_overlays_using_vision(payload, panels_dir)
    except Exception as e_vis:
        print(f"⚠️ Vision bubble repositioning failed: {e_vis}")

    if progress_callback:
        try:
            progress_callback(len(payload.get('frames', [])), len(payload.get('frames', [])), done=True)
        except Exception as e_cb:
            print(f"Error calling progress callback: {e_cb}")

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
