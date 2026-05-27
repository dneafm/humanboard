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

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
FACEBOOK_PAGE_ID = os.environ.get("FACEBOOK_PAGE_ID")
FACEBOOK_USER_ACCESS_TOKEN = os.environ.get("FACEBOOK_USER_ACCESS_TOKEN")
VENICE_API_KEY = os.environ.get("VENICE_API_KEY")
VENICE_IMAGE_MODEL = os.environ.get("VENICE_IMAGE_MODEL")
RECRAFT_API_KEY = os.environ.get("RECRAFT_API_KEY")
IMAGE_GENERATOR_BACKEND = os.environ.get("IMAGE_GENERATOR_BACKEND", "recraft")
