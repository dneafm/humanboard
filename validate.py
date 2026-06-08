import os
import json

for f in os.listdir('.'):
    if f.startswith('episode_') and f.endswith('.json'):
        try:
            with open(f, 'r', encoding='utf-8') as file:
                data = json.load(file)
            if not isinstance(data.get('frames'), list):
                print(f"{f} has non-list frames: {type(data.get('frames'))}")
        except Exception as e:
            print(f"Error loading {f}: {e}")
