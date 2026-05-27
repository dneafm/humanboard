import config
from google import genai

def list_models():
    print("--- Listing Available Models ---")
    try:
        client = genai.Client()
        models = client.models.list()
        for m in models:
            # We want to see if any image generation or Imagen models are in the list
            if "imagen" in m.name.lower() or "image" in m.name.lower() or "generate" in m.name.lower():
                print(f"- {m.name} (Supported actions: {m.supported_actions})")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_models()
