# Comic Engine 🎨

A Vietnamese DIY-tutorial comic creator that generates 4-frame carousel comics using Gemini for story planning and Recraft V3 for image generation. Features a full web dashboard for managing series, characters, objects, settings lore, and publishing to Facebook.

## Features

- **Gemini-powered story engine** — auto-generates 4-frame comic episode JSON with dialogue/narration overlays
- **Recraft V3 image generation** — consistent art style with fixed seeds per frame
- **Lore & Character database** — track characters, objects, settings per series with reference images
- **Web dashboard** — preview carousel, copy prompts, manage assets, publish to Facebook
- **Multi-series support** — archive/restore series with full series switching
- **Drag-drop + paste** reference image uploads for character/object lore cards

## Quick Start

```bash
# 1. Clone
git clone https://github.com/dneafm/comic-engine.git
cd comic-engine

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure API keys
cp .env.example .env
# Edit .env and fill in your keys

# 4. Start the dashboard
python app.py
# Open http://localhost:8080
```

## Project Structure

```
app.py              # HTTP server + all API routes
comic_engine.py     # Gemini story engine + Recraft image generation
config.py           # Loads .env into os.environ
recraft_helper.py   # Recraft V3 API wrapper
venice_helper.py    # Venice AI API wrapper (alternative backend)
facebook_helper.py  # Facebook Graph API carousel publisher
publish_carousel.py # CLI publish script
index.html          # Full web dashboard (single-file SPA)
config.yaml         # Static config
```

## API Keys Required

| Key | Where to get |
|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `RECRAFT_API_KEY` | [Recraft.ai](https://www.recraft.ai/) |
| `FACEBOOK_PAGE_ID` + `FACEBOOK_USER_ACCESS_TOKEN` | Facebook Developer App |
| `VENICE_API_KEY` | [Venice.ai](https://venice.ai/) (optional) |

## Running as a Service (Windows)

```powershell
# Start in background
Start-Process python -ArgumentList "app.py" -WorkingDirectory "F:\backtest\comic-engine" -WindowStyle Hidden
```
