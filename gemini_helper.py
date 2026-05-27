import os
import config

try:
    from google import genai
    from google.genai import types
except ImportError:
    # Just a placeholder exception so the script can import, but it will raise when instantiated
    genai = None

class GeminiHelper:
    def __init__(self):
        if genai is None:
            raise ImportError("Please install the Google GenAI SDK: pip install google-genai")
            
        if not config.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is missing from your .env file!")
            
        # The genai Client automatically reads GEMINI_API_KEY from os.environ
        self.client = genai.Client()

    def generate_image(self, prompt: str, aspect_ratio: str = "1:1") -> bytes:
        """
        Generates an image using Gemini's Imagen 3 model.
        Returns the raw image bytes.
        """
        print(f"Generating image using Imagen 3. Prompt: '{prompt}'...")
        try:
            result = self.client.models.generate_images(
                model='imagen-4.0-generate-001',
                prompt=prompt,
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    output_mime_type="image/png",
                    aspect_ratio=aspect_ratio
                )
            )
            
            for img in result.generated_images:
                return img.image.image_bytes
            
            raise RuntimeError("Gemini did not return any images.")
        except Exception as e:
            print(f"Failed to generate image via Gemini API: {e}")
            raise e
