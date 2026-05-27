import urllib.request
import urllib.parse
import json

# The actual Page ID for The Digital Retreat
PAGE_ID = "1067002106506552"

# The User Access Token you pasted
USER_ACCESS_TOKEN = "EAANYxhlWhAcBRtTndT76yWY3k7mz94MdjyQYP4ZAHonGvlEmrWxAq4Eh7fFAWI4wZBN09KgNVprYB90weyCX4RZBPAXuih8NPoZCG9uXdW3Wjxtij3CsvO2yxWzkqtbNUiPwVZBjNZCojfeZBSX15bt3lRMGEsckvG16p74H7mOJbZBZARnwZATzk4dI8ZAZA51C2449aZB75hDGzWhYPk8eY6YEOlmamXtV2qkz2U0S0QmC7A2IDLMJuyXgQX8ufDCufTzgT8T1zZBTgWV00fKDsc4rKQAe1xRQZDZD"

def post_to_specific_page():
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
        print("Managed pages found:")
        for page in data.get("data", []):
            print(f"- {page['name']} (ID: {page['id']})")
        return

    post_url = f"https://graph.facebook.com/v25.0/{PAGE_ID}/feed"
    message = "Hello world! This is a test post to my specific page."
    
    payload = urllib.parse.urlencode({
        "message": message,
        "access_token": page_access_token
    }).encode("utf-8")

    print(f"Posting message to Page ID {PAGE_ID}...")
    try:
        post_req = urllib.request.Request(post_url, data=payload, method="POST")
        with urllib.request.urlopen(post_req) as post_response:
            post_data = json.loads(post_response.read().decode())
            print(f"\n✅ Success! Post created with ID: {post_data.get('id')}")
            print(f"You can view it at: https://facebook.com/{post_data.get('id')}")
    except urllib.error.URLError as e:
        print(f"\n❌ Error creating post: {e}")
        if hasattr(e, 'read'):
            print(e.read().decode())

if __name__ == "__main__":
    post_to_specific_page()
