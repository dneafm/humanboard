import json, os

db_path = r"F:\backtest\comic-engine\series_database.json"
with open(db_path, encoding="utf-8") as f:
    db = json.load(f)

episodes = db.get("episodes", [])
series = db.get("series", [])
print(f"Total episodes in DB: {len(episodes)}")
print(f"Episode IDs: {[e['id'] for e in episodes]}")
print()
for s in series:
    print(f"Series: {s['name']} - episode_ids: {s.get('episode_ids', [])}")
