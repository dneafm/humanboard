import json
import os

from google import genai

from comic_engine import ComicEngine, generate_panels_for_episode, save_episode
from series_db import active_series, build_generation_context, load_database, record_episode_payload


def get_existing_episodes():
    episodes = []
    files = [f for f in os.listdir(".") if f.startswith("episode_") and f.endswith(".json")]
    for filename in files:
        try:
            with open(filename, "r", encoding="utf-8") as file:
                data = json.load(file)
                episodes.append({
                    "number": data.get("episode_number", 0),
                    "title": data.get("episode_title", ""),
                })
        except Exception:
            pass
    episodes.sort(key=lambda item: item["number"])
    try:
        db = load_database(rebuild=True)
        series = active_series(db)
        if series.get("protagonist_name"):
            allowed_numbers = {
                item.get("episode_number")
                for item in db.get("episodes", [])
                if item.get("mentions_primary_character")
            }
            episodes = [item for item in episodes if item["number"] in allowed_numbers]
    except Exception:
        pass
    return episodes


def generate_3_topics_ahead(existing_episodes):
    client = genai.Client()
    titles_str = ", ".join([f"Episode {item['number']}: {item['title']}" for item in existing_episodes])
    database_context = build_generation_context("")

    prompt = f"""
{database_context}

Currently, we have generated the following episodes:
{titles_str}

Please suggest exactly 3 new, highly engaging topics for the active series.
Base the topics only on the ACTIVE SERIES DATABASE above. Do not import old project names,
characters, occupations, genres, settings, tutorial formats, or visual motifs.

Your response must be a JSON list of exactly 3 strings representing the titles of these topics.
Do not include any other text.

Example response format:
[
  "Topic Title 1",
  "Topic Title 2",
  "Topic Title 3"
]
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        return json.loads(response.text.strip())
    except Exception as e:
        print(f"Error generating topics from Gemini: {e}")
        return [
            "A new turning point for the active protagonist",
            "A small conflict in the active setting",
            "A quiet discovery that changes the active series direction",
        ]


def main():
    print("--- Autogenerator: Starting 3 Posts Generation ---")

    print("\nChecking for missing panels on existing episodes...")
    files = [f for f in os.listdir(".") if f.startswith("episode_") and f.endswith(".json")]
    for filename in files:
        try:
            with open(filename, "r", encoding="utf-8") as file:
                payload = json.load(file)
                ep_num = payload.get("episode_number")
                print(f"Ensuring panels exist for Episode {ep_num}...")
                generate_panels_for_episode(payload)
        except Exception as e:
            print(f"Error checking panels for {filename}: {e}")

    existing = get_existing_episodes()
    print("\nExisting episodes:")
    for item in existing:
        print(f"- Episode {item['number']}: {item['title']}")

    print("\nSuggesting 3 new topics...")
    topics = generate_3_topics_ahead(existing)
    print("Generated topics:")
    for index, topic in enumerate(topics):
        print(f"{index + 1}. {topic}")

    engine = ComicEngine()
    next_num = max([item["number"] for item in existing]) + 1 if existing else 1

    for index, topic in enumerate(topics):
        ep_num = next_num + index
        print(f"\n--- Generating Episode {ep_num} -> Topic: '{topic}' ---")
        try:
            database_context = build_generation_context(topic)
            payload = engine.generate_episode(topic, episode_num=ep_num, database_context=database_context)
            payload["topic"] = topic
            payload["prompt_text"] = topic
            save_episode(payload)
            record_episode_payload(payload, topic)

            print(f"Generating panels for Episode {ep_num}...")
            generate_panels_for_episode(payload)
            print(f"Episode {ep_num} completed successfully.")
        except Exception as e:
            print(f"Failed to generate Episode {ep_num}: {e}")


if __name__ == "__main__":
    main()
