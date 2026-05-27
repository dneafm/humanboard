import os
import config
from venice_helper import VeniceHelper

def main():
    print("--- Venice AI Image Generation Test ---")
    try:
        # Load the Venice Helper (reads VENICE_API_KEY from .env)
        venice = VeniceHelper()
    except Exception as e:
        print(f"❌ Framework initialization error: {e}")
        return

    # Customize your test prompt here
    prompt = "A serene digital retreat sanctuary, a futuristic glass dome cozy room inside a redwood forest at sunset, holographic particles, warm soft lighting, 4k resolution"
    output_filename = "venice_test_output.png"

    try:
        # Generate the image
        image_bytes = venice.generate_image(prompt, aspect_ratio="1:1")
        
        # Save to disk
        with open(output_filename, "wb") as f:
            f.write(image_bytes)
            
        print(f"\n✅ Success! Image generated via Venice AI ({config.VENICE_IMAGE_MODEL}).")
        print(f"Output saved to: {os.path.abspath(output_filename)}")
    except Exception as e:
        print(f"\n❌ Image generation failed: {e}")

if __name__ == "__main__":
    main()
