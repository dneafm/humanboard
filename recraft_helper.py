import urllib.request
import json
import os
import sys
import config

# Ensure stdout supports UTF-8 on Windows for emoji printing
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

class RecraftHelper:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or config.RECRAFT_API_KEY or config.require_key("RECRAFT_API_KEY")
        self.model = config.RECRAFT_IMAGE_MODEL
        self.base_url = "https://external.api.recraft.ai/v1"

    def _supports_v3_style_controls(self) -> bool:
        return self.model in {"recraftv2", "recraftv2_vector", "recraftv3", "recraftv3_vector"}

    def _style_name(self) -> str:
        return config.RECRAFT_STYLE

    def _negative_prompt(self) -> str:
        return os.environ.get(
            "RECRAFT_NEGATIVE_PROMPT",
            "photorealistic, semi-realistic, realistic skin texture, skin pores, photographic, cinematic lens blur, 3D render, hyperrealism, glossy photo, live action, realistic lighting, painterly realism, plastic 3D character, photo background",
        ).strip()

    def _apply_style_controls(self, payload: dict):
        if not self._supports_v3_style_controls():
            return payload
        style = self._style_name()
        negative_prompt = self._negative_prompt()
        if style:
            payload["style"] = style
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt
        return payload

    def generate_image(self, prompt: str, aspect_ratio: str = "4:3", seed: int = -1) -> bytes:
        size = self._resolve_size(aspect_ratio)
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "n": 1,
            "size": size
        }
        if seed is not None and int(seed) >= 0:
            payload["random_seed"] = int(seed)
        self._apply_style_controls(payload)

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

    def supports_reference_image(self) -> bool:
        return self.model in {"recraftv3", "recraftv3_vector"}

    def generate_image_from_reference(self, prompt: str, reference_path: str, aspect_ratio: str = "4:3", strength: float = None, seed: int = -1) -> bytes:
        if not self.supports_reference_image():
            return self.generate_image(prompt, aspect_ratio=aspect_ratio)
        if not reference_path or not os.path.exists(reference_path):
            return self.generate_image(prompt, aspect_ratio=aspect_ratio)

        if strength is None:
            try:
                strength = float(os.environ.get("RECRAFT_REFERENCE_STRENGTH", "0.38"))
            except ValueError:
                strength = 0.38
        strength = min(1.0, max(0.0, strength))

        size = self._resolve_size(aspect_ratio)
        boundary = "----RecraftBoundaryComicEngine"
        fields = {
            "model": self.model,
            "prompt": prompt,
            "strength": str(strength),
            "n": "1",
            "size": size,
        }
        if seed is not None and int(seed) >= 0:
            fields["random_seed"] = str(int(seed))
        self._apply_style_controls(fields)
        body_parts = []
        for key, value in fields.items():
            body_parts.append(f"--{boundary}".encode("utf-8"))
            body_parts.append(f'Content-Disposition: form-data; name="{key}"'.encode("utf-8"))
            body_parts.append(b"")
            body_parts.append(str(value).encode("utf-8"))

        with open(reference_path, "rb") as f:
            image_bytes = f.read()

        body_parts.append(f"--{boundary}".encode("utf-8"))
        body_parts.append(
            f'Content-Disposition: form-data; name="image"; filename="{os.path.basename(reference_path)}"'.encode("utf-8")
        )
        body_parts.append(b"Content-Type: image/png")
        body_parts.append(b"")
        body_parts.append(image_bytes)
        body_parts.append(f"--{boundary}--".encode("utf-8"))
        req_data = b"\r\n".join(body_parts)

        url = f"{self.base_url}/images/imageToImage"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }
        req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")

        try:
            print(f"[Recraft] Generating image from reference {reference_path} using {self.model} ({size}, strength={strength})...")
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode())

            data_list = body.get("data", [])
            if not data_list:
                raise RuntimeError(f"API returned no data: {body}")

            img_url = data_list[0].get("url")
            if not img_url:
                raise RuntimeError(f"No url in response data: {data_list[0]}")

            req_img = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req_img, timeout=60) as img_resp:
                output_bytes = img_resp.read()

            print(f"[Recraft] ✅ Success! Generated reference-guided image ({len(output_bytes)//1024} KB)")
            return output_bytes
        except Exception as e:
            print(f"[Recraft] ⚠️ Reference-guided generation failed: {e}. Falling back to text generation.")
            if hasattr(e, 'read'):
                try:
                    print(f"[Recraft]    Error details: {e.read().decode()}")
                except Exception:
                    pass
            return self.generate_image(prompt, aspect_ratio=aspect_ratio)

    def _resolve_size(self, aspect_ratio: str) -> str:
        """Map aspect ratio to supported Recraft V4.1 dimensions."""
        # 1024x1024 is universally supported for recraftv4_1
        return "1024x1024"
