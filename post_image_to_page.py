import urllib.request
import urllib.parse
import json
import os

# The actual Page ID for The Digital Retreat
PAGE_ID = "1067002106506552"

# Use the User Access Token you got from the browser
USER_ACCESS_TOKEN = "EAANYxhlWhAcBRtTndT76yWY3k7mz94MdjyQYP4ZAHonGvlEmrWxAq4Eh7fFAWI4wZBN09KgNVprYB90weyCX4RZBPAXuih8NPoZCG9uXdW3Wjxtij3CsvO2yxWzkqtbNUiPwVZBjNZCojfeZBSX15bt3lRMGEsckvG16p74H7mOJbZBZARnwZATzk4dI8ZAZA51C2449aZB75hDGzWhYPk8eY6YEOlmamXtV2qkz2U0S0QmC7A2IDLMJuyXgQX8ufDCufTzgT8T1zZBTgWV00fKDsc4rKQAe1xRQZDZD"

# Path to the image you want to upload
IMAGE_PATH = r"C:\Users\dneaf\.gemini\antigravity\brain\2f565131-cf06-4e28-8164-85bfd534cff5\digital_retreat_cover_1779810233049.png"

def post_image():
    if USER_ACCESS_TOKEN == "PASTE_YOUR_TOKEN_HERE":
        print("Please replace USER_ACCESS_TOKEN in the script.")
        return
        
    if not os.path.exists(IMAGE_PATH):
        print(f"Image not found at: {IMAGE_PATH}")
        return

    print("Fetching Page Access Token...")
    accounts_url = f"https://graph.facebook.com/v25.0/me/accounts?access_token={USER_ACCESS_TOKEN}"
    try:
        req = urllib.request.Request(accounts_url)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
    except urllib.error.URLError as e:
        print(f"Error fetching pages: {e}")
        if hasattr(e, 'read'):
            print(e.read().decode())
        return

    page_access_token = None
    for page in data.get("data", []):
        if str(page["id"]) == PAGE_ID:
            page_access_token = page["access_token"]
            print(f"Found Page: {page['name']}")
            break

    if not page_access_token:
        print(f"Could not find Page with ID {PAGE_ID} in the account's managed pages.")
        return

    print(f"Uploading image '{IMAGE_PATH}' to Facebook Page...")
    
    # We will perform a multipart form upload using urllib (standard library, no dependencies)
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    parts = []
    
    # Add caption
    parts.append(f"--{boundary}".encode('utf-8'))
    parts.append('Content-Disposition: form-data; name="caption"'.encode('utf-8'))
    parts.append(''.encode('utf-8'))
    parts.append("A brand new look for The Digital Retreat! 🌟".encode('utf-8'))
    
    # Add access_token
    parts.append(f"--{boundary}".encode('utf-8'))
    parts.append('Content-Disposition: form-data; name="access_token"'.encode('utf-8'))
    parts.append(''.encode('utf-8'))
    parts.append(page_access_token.encode('utf-8'))
    
    # Add photo file
    parts.append(f"--{boundary}".encode('utf-8'))
    parts.append(f'Content-Disposition: form-data; name="source"; filename="{os.path.basename(IMAGE_PATH)}"'.encode('utf-8'))
    parts.append('Content-Type: image/png'.encode('utf-8'))
    parts.append(''.encode('utf-8'))
    
    with open(IMAGE_PATH, 'rb') as f:
        file_content = f.read()
    parts.append(file_content)
    
    # End boundary
    parts.append(f"--{boundary}--".encode('utf-8'))
    
    body = b"\r\n".join(parts)
    
    post_url = f"https://graph.facebook.com/v25.0/{PAGE_ID}/photos"
    
    req = urllib.request.Request(post_url, data=body, method="POST")
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    req.add_header('Content-Length', str(len(body)))
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode())
            print(f"\n✅ Success! Photo posted with ID: {res_data.get('id')}")
            print(f"Post ID: {res_data.get('post_id')}")
            print(f"You can view it at: https://facebook.com/{res_data.get('post_id')}")
    except urllib.error.URLError as e:
        print(f"\n❌ Error uploading photo: {e}")
        if hasattr(e, 'read'):
            print(e.read().decode())

if __name__ == "__main__":
    post_image()
