import os
from PIL import Image
import io
import sys
import time
from google import genai
from google.genai import types as _genai_types
from config import load_env

load_env()

def analyze_image(path, prompt):
    if not os.path.exists(path):
        return f"Missing file: {path}"
    try:
        client = genai.Client()
        img = Image.open(path).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_bytes = buf.getvalue()
    except Exception as e:
        return f"Error opening image {path}: {e}"
        
    for attempt in range(6):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    _genai_types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                    prompt
                ]
            )
            return response.text.strip()
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "Quota exceeded" in err_str:
                wait_time = (2 ** attempt) * 8 + 10
                print(f"[Retry] Rate limited on {path}. Retrying in {wait_time}s... (Attempt {attempt+1}/6)")
                time.sleep(wait_time)
            else:
                return f"Error analyzing {path}: {e}"
    return f"Failed to analyze {path} after 6 attempts due to rate limit."

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    print("=== STARTING IMAGE AUDIT ===")
    
    prompt = (
        "Analyze this image and describe: "
        "1. Background (is it a clean solid plain white background, or does it have grids, textures, speech bubbles, colors, or borders?) "
        "2. Text or annotations (are there any letters, numbers, badges, labels, speech bubbles, or watermark text?) "
        "3. Pose and subject clarity (is the character fully framed, centered, standing in a clear pose without hidden/obscured details?) "
        "4. Art style (is it a rough hand-drawn black-and-white ink doodle or sketch? Describe line quality.)"
    )
    
    pairs = [
        ("Freaky", "freaky_face.png", "freaky_face_clean.png"),
        ("me", "me_face.png", "me_face_clean.png"),
        ("otherself", "otherself_face.png", "otherself_face_clean.png")
    ]
    
    for name, orig, clean in pairs:
        print(f"\n--- Character: {name} ---")
        print(f"Original file: {orig}")
        desc_orig = analyze_image(orig, prompt)
        print(f"Analysis of Original:\n{desc_orig}\n")
        
        print(f"Clean file: {clean}")
        desc_clean = analyze_image(clean, prompt)
        print(f"Analysis of Clean:\n{desc_clean}")
        print("-" * 40)

if __name__ == "__main__":
    main()
