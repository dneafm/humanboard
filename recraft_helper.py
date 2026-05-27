import urllib.request
import json
import os
import sys

# Ensure stdout supports UTF-8 on Windows for emoji printing
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

class RecraftHelper:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("RECRAFT_API_KEY")
        if not self.api_key:
            # Default to the key provided by the user
            self.api_key = "cd8vNUwQwjYKG36U3QWVifhJCIINahkCO1FDgOMVSLJxDkyKQKAevk34noGV2X3F"
            
        self.model = os.environ.get("RECRAFT_IMAGE_MODEL", "recraftv3")
        self.base_url = "https://external.api.recraft.ai/v1"

    def generate_image(self, prompt: str, aspect_ratio: str = "4:3", seed: int = -1) -> bytes:
        size = self._resolve_size(aspect_ratio)
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "n": 1,
            "size": size
        }

        env_colors = os.environ.get("RECRAFT_COLORS", "").strip()
        if env_colors:
            payload["colors"] = [color.strip() for color in env_colors.split(",") if color.strip()]
        
        url = f"{self.base_url}/images/generations"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
        
        try:
            print(f"[Recraft] Generating image using {self.model} ({size})...")
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode())
                
            data_list = body.get("data", [])
            if not data_list:
                raise RuntimeError(f"API returned no data: {body}")
                
            img_url = data_list[0].get("url")
            if not img_url:
                raise RuntimeError(f"No url in response data: {data_list[0]}")
                
            # Download image bytes using standard User-Agent to bypass Cloudflare block
            req_img = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req_img, timeout=60) as img_resp:
                image_bytes = img_resp.read()
                
            print(f"[Recraft] ✅ Success! Generated image ({len(image_bytes)//1024} KB)")
            return image_bytes
            
        except Exception as e:
            print(f"[Recraft] ❌ Generation failed: {e}")
            if hasattr(e, 'read'):
                try:
                    print(f"[Recraft]    Error details: {e.read().decode()}")
                except Exception:
                    pass
            raise e

    def _resolve_size(self, aspect_ratio: str) -> str:
        """Map aspect ratio to supported Recraft V4.1 dimensions."""
        # 1024x1024 is universally supported for recraftv4_1
        return "1024x1024"
