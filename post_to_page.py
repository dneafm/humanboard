import urllib.request
import urllib.parse
import json

# Replace this with the token you just copied!
USER_ACCESS_TOKEN ="EAANYxhlWhAcBRiYU5lz84RCRXCxUaAtzx77DPbom0c1jLJO2H4QiCQE3hI3ZC9SDpyZCnATaNu9kxAoVV2ZBObr8ZCNJ05HnyknPbPDXGvNH4HGjjb9SjoQ0Gof9VUrnSE0zxGwlXHL6Voex2ozISBQupXEnRbsRRsiTZB0I1bj768jkyc3pbX99hZBqvESjfUJpXBZBenw0dpxMMvqLqpEZCzF34T2MdP9I0O8YhKMgGZBqnvldoixGsMAZDZD"

def post_to_page():
    if USER_ACCESS_TOKEN == "PASTE_YOUR_TOKEN_HERE":
        print("Please replace PASTE_YOUR_TOKEN_HERE with your actual access token in the script.")
        return

    print("Fetching your pages...")
    # Step 1: Use the User Token to get the Page ID and Page Access Token
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

    if not data.get("data"):
        print("No pages found. Make sure you granted permissions and actually have a Facebook Page on this account.")
        return

    # Let's just use the first page in the list
    page = data["data"][0]
    page_id = page["id"]
    page_name = page["name"]
    page_access_token = page["access_token"]
    
    print(f"Found page: {page_name} (ID: {page_id})")

    # Step 2: Use the Page Access Token to create a post
    post_url = f"https://graph.facebook.com/v25.0/{page_id}/feed"
    message = "Hello world! This is an automated test post via Graph API."
    
    payload = urllib.parse.urlencode({
        "message": message,
        "access_token": page_access_token
    }).encode("utf-8")

    print(f"Posting message: '{message}'...")
    try:
        post_req = urllib.request.Request(post_url, data=payload, method="POST")
        with urllib.request.urlopen(post_req) as post_response:
            post_data = json.loads(post_response.read().decode())
            print(f"Success! Post created with ID: {post_data.get('id')}")
    except urllib.error.URLError as e:
        print(f"Error creating post: {e}")
        if hasattr(e, 'read'):
            print(e.read().decode())

if __name__ == "__main__":
    post_to_page()
