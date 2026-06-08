import json, urllib.request

url = "http://desktop-ueblqsi.tail1d75be.ts.net:8080/api/episodes"
try:
    with urllib.request.urlopen(url, timeout=10) as r:
        content = r.read().decode("utf-8")
    eps = json.loads(content)
    print(f"Total episodes returned: {len(eps)}")
    for e in eps:
        imgs = e.get("images", [])
        has_img = any(i.get("exists") for i in imgs)
        title = e.get("episode_title") or e.get("title") or "(no title)"
        print(f"  Episode {e.get('episode_number')}: {title[:60].encode('ascii','replace').decode()} - hasImg: {has_img}")
except Exception as ex:
    print(f"Error: {ex}")
