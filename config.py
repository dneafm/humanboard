import os


def load_env(env_path=None):
    if not env_path:
        env_path = os.path.join(os.path.dirname(__file__), ".env")

    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                # Skip comments and empty lines
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip()


# Load env immediately on import
load_env()

# ── Gemini (script generation) ────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# ── Social / Publishing ───────────────────────────────────────────────────────
FACEBOOK_PAGE_ID = os.environ.get("FACEBOOK_PAGE_ID")
FACEBOOK_USER_ACCESS_TOKEN = os.environ.get("FACEBOOK_USER_ACCESS_TOKEN")

# ── Image generation backend ──────────────────────────────────────────────────
# Set IMAGE_GENERATOR_BACKEND in .env to one of:
#   recraft   — Recraft.ai v3 / v4 (default)
#   venice    — Venice AI / Flux via surplusintelligence.ai proxy
#   openai    — OpenAI DALL-E 3 (gpt-image-1 or dall-e-3)
#   flux      — Black Forest Labs Flux via direct API
IMAGE_GENERATOR_BACKEND = os.environ.get("IMAGE_GENERATOR_BACKEND", "recraft")

# ── Recraft ───────────────────────────────────────────────────────────────────
RECRAFT_API_KEY = os.environ.get("RECRAFT_API_KEY")
RECRAFT_IMAGE_MODEL = os.environ.get("RECRAFT_IMAGE_MODEL", "recraftv3")
RECRAFT_STYLE = os.environ.get("RECRAFT_STYLE", "Illustration")

# ── Venice AI (Flux proxy) ────────────────────────────────────────────────────
VENICE_API_KEY = os.environ.get("VENICE_API_KEY")
VENICE_IMAGE_MODEL = os.environ.get("VENICE_IMAGE_MODEL", "venice-flux-2-max")

# ── OpenAI (DALL-E / gpt-image-1) ────────────────────────────────────────────
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_IMAGE_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")  # or dall-e-3

# ── Black Forest Labs Flux (direct) ──────────────────────────────────────────
BFL_API_KEY = os.environ.get("BFL_API_KEY")
BFL_IMAGE_MODEL = os.environ.get("BFL_IMAGE_MODEL", "flux-pro-1.1")


def require_key(name: str) -> str:
    """Return the named env var or raise a clear error."""
    val = os.environ.get(name, "").strip()
    if not val:
        raise ValueError(
            f"{name} is not set. Add it to your .env file:\n  {name}=your_key_here"
        )
    return val
