<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run HumanBoard with Gemma live

This app targets a live local OpenAI-compatible Gemma runtime for its main idea/chat/goal workflows.

## Chosen runtime for HumanBoard

- Runtime: Ollama OpenAI-compatible API
- Base URL: `http://127.0.0.1:11434/v1`
- Model: `gemma4:26b`
- HumanBoard invocation: `POST /chat/completions` with `model`, `temperature`, and standard OpenAI-style `messages`

## Current install status on this workstation

- HumanBoard is already wired for an OpenAI-compatible local runtime in `src/lib/ai.ts`.
- The checked-in env example already points to `gemma4:26b`.
- `ollama` is installed locally and running enough to answer `ollama list`.
- `ollama show gemma4:26b` failed because the model is not installed yet.
- `ollama pull gemma4:26b` failed with:
  - `The model you are attempting to pull requires a newer version of Ollama.`

That means the chosen HumanBoard runtime path is clear, but the local serving environment is currently blocked by an outdated Ollama build.

## Install and run locally after upgrading Ollama

**Prerequisites:** Node.js and a recent Ollama build that supports Gemma 4

1. Upgrade Ollama from:
   `https://ollama.com/download`
2. Install dependencies:
   `npm install`
3. Pull the HumanBoard model in Ollama:
   `ollama pull gemma4:26b`
4. Verify the local serving path works:
   - `ollama run gemma4:26b`
   - or PowerShell:
     `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:11434/api/chat -ContentType 'application/json' -Body '{"model":"gemma4:26b","messages":[{"role":"user","content":"Hello from HumanBoard"}],"stream":false}'`
5. Set Gemma runtime values in `.env.local`:
   - `VITE_GEMMA_BASE_URL=http://127.0.0.1:11434/v1`
   - `VITE_GEMMA_MODEL=gemma4:26b`
   - `VITE_GEMMA_API_KEY=not-required`
6. Run the app:
   `npm run dev`

## HumanBoard invocation contract

HumanBoard uses the OpenAI-style chat completions path:

- URL: `${VITE_GEMMA_BASE_URL}/chat/completions`
- Method: `POST`
- Headers:
  - `Content-Type: application/json`
  - optional `Authorization: Bearer ${VITE_GEMMA_API_KEY}`
- Body shape:

```json
{
  "model": "gemma4:26b",
  "temperature": 0.4,
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ]
}
```

Main live AI surfaces wired through this runtime:
- idea refinement
- block-level writing actions
- goals roadmap generation
- cross-app chatbot

## Note about the staged local Gemma folder

A repo folder named `gemma 4/gemma-4-26B-A4B-it` exists in the staged snapshot, but the DeerFlow sandbox could not verify usable local weights from it for direct serving. For this HumanBoard task, the intended and documented runtime path is Ollama because `src/lib/ai.ts` already targets an OpenAI-compatible `/v1/chat/completions` contract.
