import urllib.request
import json
import base64
import config
import sys

# Ensure stdout supports UTF-8 on Windows for emoji printing
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────
# NOTE ON CONTROLS
# The surplusintelligence.ai proxy enforces strict OpenAI schema —
# it rejects negative_prompt, cfg_scale, steps, seed as unrecognized.
# All realism control must be done through prompt engineering.
#
# Best models for photorealistic humans (in priority order):
#   1. venice-lustify-sdxl  — SDXL photorealism fine-tune
#   2. venice-sd35          — SD 3.5, strong realism
#   3. venice-flux-2-max    — Best detail/quality, less controllable
# ─────────────────────────────────────────────────────────────────────

# Anti-cartoon suffix injected into every prompt
REALISM_SUFFIX = (
    ", hyperrealistic DSLR photography, photorealistic skin with visible pores "
    "and subsurface scattering, sharp lens focus, cinematic depth of field, "
    "film grain, natural anatomical proportions, NOT anime NOT cartoon NOT illustration "
    "NOT digital painting NOT 3D render NOT watercolor, real person photography, 8k"
)

# Models confirmed working through surplusintelligence.ai proxy.
# SDXL models (lustify-sdxl, sd35) are not available on this marketplace.
# Flux 2 Max gives the best image quality available here.
IMAGE_MODELS = [
    "venice-flux-2-max",     # Best quality available through this proxy
    "venice-flux-2-pro",     # Faster fallback
]

ENDPOINT = "https://www.surplusintelligence.ai/api/inference/v1/images/generations"


class VeniceHelper:
    def __init__(self):
        if not config.VENICE_API_KEY:
            raise ValueError("VENICE_API_KEY is missing from your .env file!")
        self.api_key = config.VENICE_API_KEY

    def generate_image(
        self,
        prompt: str,
        aspect_ratio: str = "4:3",
        seed: int = -1,   # kept for API compat, not passed to proxy
    ) -> bytes:
        """
        Generates a photorealistic image.
        Injects realism keywords into the prompt since the proxy
        does not support negative_prompt / cfg_scale / steps.

        Args:
            prompt:       The image generation prompt.
            aspect_ratio: "4:3", "16:9", "1:1", etc.
            seed:         Accepted for API compatibility but not sent to proxy.

        Returns:
            Raw PNG image bytes.
        """
        width, height = self._resolve_size(aspect_ratio)
        size_str = f"{width}x{height}"

        # Inject realism suffix into every prompt
        full_prompt = prompt.rstrip() + REALISM_SUFFIX

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        last_error = None
        for model in IMAGE_MODELS:
            payload = {
                "model": model,
                "prompt": full_prompt,
                "n": 1,
                "size": size_str,
                "response_format": "b64_json",
            }

            print(f"[Venice] model={model} | {width}x{height} | prompt[0:80]='{full_prompt[:80]}...'")

            try:
                image_bytes = self._post(payload, headers)
                print(f"[Venice] ✅ Success with {model} ({len(image_bytes)//1024} KB)")
                return image_bytes
            except Exception as e:
                last_error = e
                code = getattr(e, "code", "?")
                print(f"[Venice] ❌ {model} failed ({code}): {e}")
                if hasattr(e, "read"):
                    try:
                        body_text = e.read().decode()[:300]
                        print(f"[Venice]    {body_text}")
                    except Exception:
                        pass

        raise last_error

    def _post(self, payload: dict, headers: dict) -> bytes:
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            ENDPOINT, data=req_data, headers=headers, method="POST"
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode())

        data_list = body.get("data", [])
        if not data_list:
            raise RuntimeError(f"API returned no data: {body}")

        item = data_list[0]
        b64 = item.get("b64_json")
        if b64:
            return base64.b64decode(b64)

        url = item.get("url")
        if url:
            with urllib.request.urlopen(url, timeout=60) as img_resp:
                return img_resp.read()

        raise RuntimeError(f"No b64_json or url in response: {item}")

    def _resolve_size(self, aspect_ratio: str) -> tuple:
        """Map aspect ratio to pixel dimensions supported by Venice."""
        mapping = {
            "4:3":  (1536, 1024),
            "3:2":  (1536, 1024),
            "16:9": (1792, 1024),
            "1:1":  (1024, 1024),
            "9:16": (1024, 1792),
        }
        return mapping.get(aspect_ratio, (1536, 1024))
