import base64
import json
import mimetypes
import os
import sys
import uuid
import urllib.error
import urllib.request

import config

# Ensure stdout supports UTF-8 on Windows for emoji printing
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


class BearerGPTImage2Helper:
    def __init__(self):
        self.bearer_api_key = config.BEARER_API_KEY
        if not self.bearer_api_key:
            raise ValueError("BEARER_API_KEY (or TEST_CPA_BEARER) is missing from your .env file!")
        self.base_url = (config.BEARER_BASE_URL or "https://api.bearer.sh").rstrip("/")
        self.model = config.BEARER_IMAGE_MODEL or "gpt-image-2"

    def generate_image(
        self,
        prompt: str,
        aspect_ratio: str = "4:3",
        seed: int = -1,
        style_id: str = None,
    ) -> bytes:
        size_str = self._resolve_size(aspect_ratio)
        payload = {
            "model": self.model,
            "prompt": prompt,
            "size": size_str,
            "n": 1,
            "response_format": "b64_json",
        }
        if style_id:
            payload["style"] = style_id
        if seed is not None and int(seed) >= 0:
            payload["seed"] = int(seed)

        headers = {
            "Authorization": f"Bearer {self.bearer_api_key}",
            "Content-Type": "application/json",
        }
        normalized_base = self.base_url.rstrip('/')
        if normalized_base.endswith('/v1'):
            url = f"{normalized_base}/images/generations"
        else:
            url = f"{normalized_base}/v1/images/generations"
        attempts = [
            payload,
            {k: v for k, v in payload.items() if k not in {"response_format", "seed", "style"}},
            {
                "model": self.model,
                "prompt": prompt[:900],
                "size": size_str,
                "n": 1,
            },
        ]

        last_error = None
        print(f"[GPT Image] Generating image via CPA using {self.model} ({size_str})...")
        for idx, attempt_payload in enumerate(attempts, start=1):
            req_data = json.dumps(attempt_payload).encode("utf-8")
            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    body = json.loads(resp.read().decode())
                image_bytes = self._extract_image_bytes(body)
                print(f"[GPT Image] ✅ Success via CPA! Generated image ({len(image_bytes)//1024} KB) on attempt {idx}")
                return image_bytes
            except Exception as e:
                last_error = e
                print(f"[GPT Image] attempt {idx} failed: {e}")
                details = ""
                if hasattr(e, 'read'):
                    try:
                        details = e.read().decode()
                        print(f"[GPT Image]    Error details: {details}")
                    except Exception:
                        details = ""
                if "Tool choice 'image_generation' not found in 'tools' parameter" not in details:
                    break

        print(f"[GPT Image] ❌ CPA generation failed: {last_error}")
        raise last_error

    def generate_image_from_reference(
        self,
        prompt: str,
        reference_image_path: str,
        aspect_ratio: str = "1:1",
        strength: float = 0.35,
    ) -> bytes:
        normalized_base = self.base_url.rstrip('/')
        if normalized_base.endswith('/v1'):
            edits_url = f"{normalized_base}/images/edits"
        else:
            edits_url = f"{normalized_base}/v1/images/edits"

        size_str = self._resolve_size(aspect_ratio)
        edit_prompt = (
            f"Use the uploaded image as the identity anchor. Preserve the exact character identity, "
            f"silhouette, proportions, face shape, eyes, posture language, and drawing style. "
            f"Only clean and canonicalize it into a production reference: single subject, centered, "
            f"plain white background, no text, no labels, no collage, no decorative background, no redesign. "
            f"{prompt}"
        )

        try:
            print(f"[GPT Image] Trying CPA image edit/reference mode for {os.path.basename(reference_image_path)}...")
            body, content_type = self._build_multipart_edit_body(
                prompt=edit_prompt,
                image_path=reference_image_path,
                size=size_str,
            )
            req = urllib.request.Request(
                edits_url,
                data=body,
                headers={
                    "Authorization": f"Bearer {self.bearer_api_key}",
                    "Content-Type": content_type,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                body_json = json.loads(resp.read().decode())
            image_bytes = self._extract_image_bytes(body_json)
            print(f"[GPT Image] ✅ Success via CPA image edit/reference mode ({len(image_bytes)//1024} KB)")
            return image_bytes
        except Exception as e:
            print(f"[GPT Image] reference mode failed, falling back to data-url guided generation: {e}")
            if hasattr(e, 'read'):
                try:
                    print(f"[GPT Image]    Error details: {e.read().decode()}")
                except Exception:
                    pass

        with open(reference_image_path, "rb") as f:
            ref_bytes = f.read()
        mime_type = mimetypes.guess_type(reference_image_path)[0] or "image/png"
        ref_data_url = f"data:{mime_type};base64,{base64.b64encode(ref_bytes).decode('ascii')}"
        guided_prompt = (
            "Use this reference image as the exact identity anchor and preserve it closely. "
            "Do not redesign or reinterpret the character. Keep the same face, silhouette, proportions, "
            f"and drawing language. Reference image: {ref_data_url}\n\n{edit_prompt}"
        )
        return self.generate_image(guided_prompt, aspect_ratio=aspect_ratio)

    def _build_multipart_edit_body(self, prompt: str, image_path: str, size: str):
        boundary = f"----HermesBoundary{uuid.uuid4().hex}"
        with open(image_path, "rb") as f:
            image_bytes = f.read()
        mime_type = mimetypes.guess_type(image_path)[0] or "image/png"
        filename = os.path.basename(image_path) or "reference.png"

        parts = []

        def add_field(name: str, value: str):
            parts.extend([
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                str(value).encode("utf-8"),
                b"\r\n",
            ])

        add_field("model", self.model)
        add_field("prompt", prompt)
        add_field("size", size)
        add_field("n", "1")

        parts.extend([
            f"--{boundary}\r\n".encode("utf-8"),
            f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'.encode("utf-8"),
            f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"),
            image_bytes,
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ])

        body = b"".join(parts)
        return body, f"multipart/form-data; boundary={boundary}"

    def _extract_image_bytes(self, body: dict) -> bytes:
        data_list = body.get("data", [])
        if not data_list:
            raise RuntimeError(f"API returned no data: {body}")

        item = data_list[0]
        b64 = item.get("b64_json")
        if b64:
            return base64.b64decode(b64)

        image_b64 = item.get("image_base64")
        if image_b64:
            return base64.b64decode(image_b64)

        url = item.get("url")
        if url:
            with urllib.request.urlopen(url, timeout=60) as img_resp:
                return img_resp.read()

        raise RuntimeError(f"No supported image payload in response: {item}")

    def _resolve_size(self, aspect_ratio: str) -> str:
        mapping = {
            "4:3": "1536x1024",
            "3:2": "1536x1024",
            "16:9": "1792x1024",
            "1:1": "1024x1024",
            "9:16": "1024x1792",
        }
        return mapping.get(aspect_ratio, "1536x1024")
