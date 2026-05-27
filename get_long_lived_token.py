import urllib.request
import urllib.parse
import json

# Your App ID
APP_ID = "942032782001159"

# 1. Get this from App Settings -> Basic (Cài đặt ứng dụng -> Thông tin cơ bản)
APP_SECRET = "PASTE_YOUR_APP_SECRET_HERE" 

# 2. Paste the token you just got from the browser URL
SHORT_LIVED_TOKEN = "PASTE_YOUR_SHORT_LIVED_TOKEN_HERE"

def get_long_lived_token():
    if APP_SECRET == "PASTE_YOUR_APP_SECRET_HERE" or SHORT_LIVED_TOKEN == "PASTE_YOUR_SHORT_LIVED_TOKEN_HERE":
        print("Please replace APP_SECRET and SHORT_LIVED_TOKEN in the script before running.")
        return

    # Step 1: Exchange short-lived user token for long-lived user token (valid for 60 days)
    print("Exchanging for a long-lived User Token...")
    url = (f"https://graph.facebook.com/v25.0/oauth/access_token?"
           f"grant_type=fb_exchange_token&"
           f"client_id={APP_ID}&"
           f"client_secret={APP_SECRET}&"
           f"fb_exchange_token={SHORT_LIVED_TOKEN}")
    
    try:
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
            long_lived_user_token = data.get("access_token")
            print("\n✅ Success! Your 60-day Long-Lived User Token is:")
            print(long_lived_user_token)
    except urllib.error.URLError as e:
        print(f"Error getting long-lived token: {e}")
        if hasattr(e, 'read'):
            print(e.read().decode())
        return

    # Step 2: Use the long-lived user token to get a NEVER-EXPIRING Page Token
    print("\nFetching Never-Expiring Page Tokens...")
    accounts_url = f"https://graph.facebook.com/v25.0/me/accounts?access_token={long_lived_user_token}"
    
    try:
        with urllib.request.urlopen(accounts_url) as response:
            page_data = json.loads(response.read().decode())
            pages = page_data.get("data", [])
            
            if not pages:
                print("No pages found for this user.")
                return
                
            for page in pages:
                print(f"\nPage Name: {page['name']}")
                print(f"Page ID: {page['id']}")
                print(f"NEVER-EXPIRING Page Token:\n{page['access_token']}")
                print("-" * 50)
                
            print("\n💡 TIP: Use these Never-Expiring Page Tokens in your scripts. They will not expire unless you change your password or revoke the app permissions!")
            
    except urllib.error.URLError as e:
        print(f"Error fetching pages: {e}")
        if hasattr(e, 'read'):
            print(e.read().decode())

if __name__ == "__main__":
    get_long_lived_token()
