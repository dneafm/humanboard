import urllib.request
import urllib.parse
import json

PAGE_ID = "1067002106506552"
USER_ACCESS_TOKEN = "EAANYxhlWhAcBRoZAZCawZB9jC9SOEBQSejhOjZCefnfmSwZAoNkcx9tsFZAQeXkNRbW5KGqSM9JoJcOZC7itrzGyvYQUyjPoThNiUmQGIHKO4dl8EWktbNiZCJqFi46ZAdYr7My4JZATk8OTuuUwY4yAuqjfr1Ch1PV5hyuJ4MJRNBa8L81GgeYnHZA89LHXrRuP1RseXLO2R3mlmPOZBKATZBoaSuQlJcwdFkZCgfG4d7ZAaiqVBhxAeLLXHqnzLQd92GJiZA5pymI0ZBZB7oB7OLVS0knVmEgQIyzwZDZD"
PHOTO_ID = "122100382317335796" # The Photo ID we just uploaded

def set_profile_picture():
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

    print(f"Setting Photo ID {PHOTO_ID} as the profile picture for Page {PAGE_ID}...")
    
    post_url = f"https://graph.facebook.com/v25.0/{PAGE_ID}/picture"
    
    payload = urllib.parse.urlencode({
        "photo": PHOTO_ID,
        "access_token": page_access_token,
        "redirect": "0" # Returns a JSON response instead of a redirect
    }).encode("utf-8")

    try:
        post_req = urllib.request.Request(post_url, data=payload, method="POST")
        with urllib.request.urlopen(post_req) as post_response:
            res_data = json.loads(post_response.read().decode())
            print(f"\n✅ Success! Profile picture updated.")
            print("Response:", res_data)
    except urllib.error.URLError as e:
        print(f"\n❌ Error setting profile picture: {e}")
        if hasattr(e, 'read'):
            print(e.read().decode())

if __name__ == "__main__":
    set_profile_picture()
