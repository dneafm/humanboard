import urllib.request
import urllib.parse
import json
import os
import config
from facebook_helper import FacebookHelper

def upload_unpublished_photo(fb: FacebookHelper, image_path: str) -> str:
    """
    Uploads a photo to Facebook Page with published=false.
    Returns the media_fbid (photo ID).
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found at: {image_path}")
        
    print(f"Uploading unpublished photo '{os.path.basename(image_path)}'...")
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    parts = []
    
    # Set published to false so it doesn't show up on feed yet
    parts.append(f"--{boundary}".encode('utf-8'))
    parts.append('Content-Disposition: form-data; name="published"'.encode('utf-8'))
    parts.append(''.encode('utf-8'))
    parts.append("false".encode('utf-8'))
    
    # Page Access Token
    parts.append(f"--{boundary}".encode('utf-8'))
    parts.append('Content-Disposition: form-data; name="access_token"'.encode('utf-8'))
    parts.append(''.encode('utf-8'))
    parts.append(fb.page_token.encode('utf-8'))
    
    # Image Source File
    parts.append(f"--{boundary}".encode('utf-8'))
    parts.append(f'Content-Disposition: form-data; name="source"; filename="{os.path.basename(image_path)}"'.encode('utf-8'))
    parts.append('Content-Type: image/png'.encode('utf-8'))
    parts.append(''.encode('utf-8'))
    
    with open(image_path, 'rb') as f:
        file_content = f.read()
    parts.append(file_content)
    
    parts.append(f"--{boundary}--".encode('utf-8'))
    body = b"\r\n".join(parts)
    
    url = f"https://graph.facebook.com/v25.0/{fb.page_id}/photos"
    
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    req.add_header('Content-Length', str(len(body)))
    
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        photo_id = data.get("id")
        print(f"Uploaded successfully. Temporary Photo ID: {photo_id}")
        return photo_id

def publish_carousel_post(fb: FacebookHelper, photo_ids: list, caption: str) -> str:
    """
    Publishes a single post linking multiple uploaded photo IDs (multi-photo post).
    """
    print("\nPublishing carousel post linking all photo IDs...")
    url = f"https://graph.facebook.com/v25.0/{fb.page_id}/feed"
    
    # Format attached_media as JSON array of dicts: [{"media_fbid": "id1"}, ...]
    attached_media = [{"media_fbid": pid} for pid in photo_ids]
    
    payload = urllib.parse.urlencode({
        "message": caption,
        "attached_media": json.dumps(attached_media),
        "access_token": fb.page_token
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, method="POST")
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        post_id = data.get("id")
        print(f"\n🎉 Success! Multi-photo carousel post published!")
        print(f"Post ID: {post_id}")
        print(f"View it live: https://facebook.com/{post_id}")
        return post_id

def main():
    print("--- Facebook Multi-Photo Carousel Publisher ---")
    
    import sys
    ep_num = 1
    if len(sys.argv) > 1:
        try:
            ep_num = int(sys.argv[1])
        except ValueError:
            print(f"Invalid episode number argument: {sys.argv[1]}. Defaulting to 1.")
            
    episode_file = f"episode_{ep_num}.json"
    if not os.path.exists(episode_file):
        print(f"❌ Error: {episode_file} not found. Run comic_engine.py first.")
        return
        
    with open(episode_file, "r", encoding="utf-8") as f:
        episode_data = json.load(f)
        
    caption = episode_data.get("caption_post", "")
    
    # 2. Check for panel images
    panels_dir = f"episode_{ep_num}_panels"
    if not os.path.exists(panels_dir):
        print(f"❌ Error: Panel folder '{panels_dir}' not found.")
        print(f"Please create a folder named '{panels_dir}' and save your 4 generated panel images as:")
        print("  - panel_1.png")
        print("  - panel_2.png")
        print("  - panel_3.png")
        print("  - panel_4.png")
        return
        
    panel_files = [
        os.path.join(panels_dir, "panel_1.png"),
        os.path.join(panels_dir, "panel_2.png"),
        os.path.join(panels_dir, "panel_3.png"),
        os.path.join(panels_dir, "panel_4.png")
    ]
    
    # Ensure all exist
    for pf in panel_files:
        if not os.path.exists(pf):
            print(f"❌ Error: Missing panel file: {pf}")
            return
            
    # 3. Connect to Facebook and execute flow
    try:
        fb = FacebookHelper()
        
        # Upload all panels as unpublished
        uploaded_ids = []
        for pf in panel_files:
            photo_id = upload_unpublished_photo(fb, pf)
            uploaded_ids.append(photo_id)
            
        # Publish the feed post with all 4 photos attached
        publish_carousel_post(fb, uploaded_ids, caption)
        
    except Exception as e:
        print(f"\n❌ Failed to publish carousel: {e}")

if __name__ == "__main__":
    main()
