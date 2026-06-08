"""
OpenAI image generation helper for the Comic Engine.

Endpoints used:
  POST /v1/images/generations  — text-to-image (gpt-image-1 / dall-e-3)
  POST /v1/images/edits        — image-to-image with reference (gpt-image-1 only)

Authentication: Bearer OPENAI_API_KEY
Format: multipart/form-data for edits; JSON for generations.

Reference image rules (OpenAI):
  - Must be a valid PNG, < 4 MB
  - Sent as `image` field in multipart/form-data
  - `mask` is optional; omitting it lets the model decide what to edit
  - Response format: b64_json (we decode to bytes)
"""

import urllib.request
import json
import os
import io
import base64
import config

# Ensure stdout supports UTF-8 on Windows
import sys
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

_BASE_URL = "https://api.openai.com/v1"


class OpenAIHelper:
    """
    Image generation via OpenAI gpt-image-1 (or dall-e-3).

    Usage:
        helper = OpenAIHelper()
        png_bytes = helper.generate_image("A dramatic comic panel", aspect_ratio="4:3")
        png_bytes = helper.generate_image_from_reference("same pose but comic style", "ref.png")
    """

    def __init__(self, api_key: str = None):
        self.api_key = api_key or config.OPENAI_API_KEY or config.require_key("OPENAI_API_KEY")
        self.model = config.OPENAI_IMAGE_MODEL  # e.g. "gpt-image-1" or "dall-e-3"
        self._base_url = _BASE_URL

    # ──────────────────────────────────────────────────────────
    # Public interface (matches RecraftHelper / VeniceHelper)
    # ──────────────────────────────────────────────────────────

    def generate_image(self, prompt: str, aspect_ratio: str = "4:3",
                       seed: int = -1, style_id: str = "") -> bytes:
        """Text-to-image via POST /v1/images/generations (JSON body)."""
        size = self._resolve_size(aspect_ratio)
        payload = {
            "model": self.model,
            "prompt": prompt,
            "n": 1,
            "size": size,
            "response_format": "b64_json",
        }
        # dall-e-3 supports quality; gpt-image-1 ignores unknown fields gracefully
        if self.model == "dall-e-3":
            payload["quality"] = "hd"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        req_data = json.dumps(payload).encode("utf-8")
        url = f"{self._base_url}/images/generations"

        print(f"[OpenAI] Generating image via {self.model} ({size})...")
        try:
            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = json.loads(resp.read().decode())
            return self._extract_bytes(body)
        except Exception as e:
            self._log_error(e, "generation")
            raise

    def generate_image_from_reference(self, prompt: str, reference_path: str,
                                       aspect_ratio: str = "4:3",
                                       strength: float = None,
                                       seed: int = -1,
                                       style_id: str = "") -> bytes:
        """
        Image-to-image via POST /v1/images/edits (multipart/form-data).

        The `strength` parameter is not supported by OpenAI's edit endpoint;
        it is accepted for API compatibility but ignored.

        Requirements (OpenAI):
          - reference_path must be a valid PNG file < 4 MB
          - No mask needed; the model edits the whole image guided by prompt
        """
        if not reference_path or not os.path.exists(reference_path):
            print(f"[OpenAI] Reference image not found: {reference_path!r}. Falling back to text generation.")
            return self.generate_image(prompt, aspect_ratio=aspect_ratio)

        # Ensure the file is PNG and < 4 MB — convert if necessary
        png_bytes = self._to_png_bytes(reference_path)
        if len(png_bytes) > 4 * 1024 * 1024:
            print(f"[OpenAI] Reference image > 4 MB after conversion ({len(png_bytes)//1024} KB). Falling back to text generation.")
            return self.generate_image(prompt, aspect_ratio=aspect_ratio)

        size = self._resolve_size(aspect_ratio)
        boundary = "----OpenAIComicEngineBoundary"

        fields = {
            "model": self.model,
            "prompt": prompt,
            "n": "1",
            "size": size,
            "response_format": "b64_json",
        }
        body_parts = []
        for key, value in fields.items():
            body_parts.append(f"--{boundary}".encode())
            body_parts.append(f'Content-Disposition: form-data; name="{key}"'.encode())
            body_parts.append(b"")
            body_parts.append(str(value).encode("utf-8"))

        # image field — must be named "image", filename must end in .png
        img_filename = os.path.splitext(os.path.basename(reference_path))[0] + ".png"
        body_parts.append(f"--{boundary}".encode())
        body_parts.append(
            f'Content-Disposition: form-data; name="image"; filename="{img_filename}"'.encode()
        )
        body_parts.append(b"Content-Type: image/png")
        body_parts.append(b"")
        body_parts.append(png_bytes)

        body_parts.append(f"--{boundary}--".encode())
        req_data = b"\r\n".join(body_parts)

        url = f"{self._base_url}/images/edits"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }

        print(f"[OpenAI] Editing image from reference '{reference_path}' via {self.model} ({size})...")
        try:
            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=180) as resp:
                body = json.loads(resp.read().decode())
            result = self._extract_bytes(body)
            print(f"[OpenAI] ✅ Success! Reference-guided image ({len(result)//1024} KB)")
            return result
        except Exception as e:
            print(f"[OpenAI] ⚠️ Edit failed: {e}. Falling back to text generation.")
            self._log_error(e, "edit")
            return self.generate_image(prompt, aspect_ratio=aspect_ratio)

    def supports_reference_image(self) -> bool:
        """gpt-image-1 supports /edits; dall-e-3 does not."""
        return self.model == "gpt-image-1"

    # ──────────────────────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────────────────────

    def _resolve_size(self, aspect_ratio: str) -> str:
        """
        Map aspect ratio to OpenAI-supported sizes.
        gpt-image-1 supports: 1024x1024, 1536x1024, 1024x1536, auto
        dall-e-3 supports:    1024x1024, 1792x1024, 1024x1792
        """
        mapping = {
            "4:3":  "1536x1024",
            "3:2":  "1536x1024",
            "16:9": "1792x1024",  # dall-e-3 compatible; gpt-image-1 rounds to nearest
            "1:1":  "1024x1024",
            "9:16": "1024x1792",
            "3:4":  "1024x1536",
        }
        return mapping.get(aspect_ratio, "1536x1024")

    def _extract_bytes(self, body: dict) -> bytes:
        data_list = body.get("data", [])
        if not data_list:
            raise RuntimeError(f"[OpenAI] API returned no data: {body}")
        item = data_list[0]
        b64 = item.get("b64_json")
        if b64:
            return base64.b64decode(b64)
        url = item.get("url")
        if url:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        raise RuntimeError(f"[OpenAI] No b64_json or url in response item: {item}")

    def _to_png_bytes(self, path: str) -> bytes:
        """Load an image (any format) and return PNG bytes via Pillow if available."""
        try:
            from PIL import Image
            import io as _io
            with Image.open(path) as img:
                img = img.convert("RGBA")  # PNG supports transparency
                buf = _io.BytesIO()
                img.save(buf, format="PNG")
                return buf.getvalue()
        except ImportError:
            # Pillow not installed — just read raw bytes and hope it's already PNG
            with open(path, "rb") as f:
                return f.read()
        except Exception as e:
            print(f"[OpenAI] Warning: could not convert reference to PNG ({e}), sending raw bytes.")
            with open(path, "rb") as f:
                return f.read()

    def _log_error(self, e, stage: str):
        print(f"[OpenAI] ❌ {stage} failed: {e}")
        if hasattr(e, "read"):
            try:
                print(f"[OpenAI]    Error detail: {e.read().decode()[:400]}")
            except Exception:
                pass
