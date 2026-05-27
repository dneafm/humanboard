import urllib.request
import urllib.parse
import json
import config

class FacebookHelper:
    def __init__(self):
        if not config.FACEBOOK_PAGE_ID or not config.FACEBOOK_USER_ACCESS_TOKEN:
            raise ValueError("Facebook configuration (FACEBOOK_PAGE_ID and FACEBOOK_USER_ACCESS_TOKEN) is missing from your .env file!")
            
        self.page_id = config.FACEBOOK_PAGE_ID
        self.user_token = config.FACEBOOK_USER_ACCESS_TOKEN
        self._page_token = None

    @property
    def page_token(self):
        """Lazy-loaded Page Access Token"""
        if not self._page_token:
            self._page_token = self._fetch_page_access_token()
        return self._page_token

    def _fetch_page_access_token(self) -> str:
        print("Fetching Page Access Token from Facebook...")
        url = f"https://graph.facebook.com/v25.0/me/accounts?access_token={self.user_token}"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                for page in data.get("data", []):
                    if str(page["id"]) == self.page_id:
                        print(f"Found Page: {page['name']} - retrieved token.")
                        return page["access_token"]
            raise ValueError(f"Could not find Page with ID {self.page_id} in your managed accounts.")
        except Exception as e:
            print(f"Error fetching page access token: {e}")
            raise e

    def post_text(self, message: str) -> str:
        """Publishes a text post to the page feed."""
        print(f"Posting text update to Page feed: '{message}'...")
        url = f"https://graph.facebook.com/v25.0/{self.page_id}/feed"
        payload = urllib.parse.urlencode({
            "message": message,
            "access_token": self.page_token
        }).encode("utf-8")

        try:
            req = urllib.request.Request(url, data=payload, method="POST")
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                print(f"Success! Post created with ID: {data.get('id')}")
                return data.get("id")
        except Exception as e:
            print(f"Error creating post: {e}")
            raise e

    def post_photo(self, image_bytes: bytes, caption: str) -> dict:
        """Uploads and publishes a photo to the page with a caption."""
        print(f"Uploading photo to Page feed with caption: '{caption}'...")
        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
        parts = []
        
        # Caption
        parts.append(f"--{boundary}".encode('utf-8'))
        parts.append('Content-Disposition: form-data; name="caption"'.encode('utf-8'))
        parts.append(''.encode('utf-8'))
        parts.append(caption.encode('utf-8'))
        
        # Page Access Token
        parts.append(f"--{boundary}".encode('utf-8'))
        parts.append('Content-Disposition: form-data; name="access_token"'.encode('utf-8'))
        parts.append(''.encode('utf-8'))
        parts.append(self.page_token.encode('utf-8'))
        
        # Image Source File
        parts.append(f"--{boundary}".encode('utf-8'))
        parts.append(f'Content-Disposition: form-data; name="source"; filename="upload.png"'.encode('utf-8'))
        parts.append('Content-Type: image/png'.encode('utf-8'))
        parts.append(''.encode('utf-8'))
        parts.append(image_bytes)
        
        parts.append(f"--{boundary}--".encode('utf-8'))
        body = b"\r\n".join(parts)
        
        url = f"https://graph.facebook.com/v25.0/{self.page_id}/photos"
        
        try:
            req = urllib.request.Request(url, data=body, method="POST")
            req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
            req.add_header('Content-Length', str(len(body)))
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                print(f"Success! Photo posted. ID: {data.get('id')}")
                return data
        except Exception as e:
            print(f"Error posting photo: {e}")
            raise e

    def set_profile_picture(self, photo_id: str) -> dict:
        """Sets an already uploaded photo as the Page profile picture."""
        print(f"Updating profile picture to Photo ID: {photo_id}...")
        url = f"https://graph.facebook.com/v25.0/{self.page_id}/picture"
        payload = urllib.parse.urlencode({
            "photo": photo_id,
            "access_token": self.page_token,
            "redirect": "0"
        }).encode("utf-8")

        try:
            req = urllib.request.Request(url, data=payload, method="POST")
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                print("Success! Profile picture updated.")
                return data
        except Exception as e:
            print(f"Error updating profile picture: {e}")
            raise e
