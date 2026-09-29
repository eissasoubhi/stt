# STT — Arabic voice dictation

Browser extension + local Node.js gateway for **voice → text** dictation on websites.

The current version supports three transcription providers:

- **Deepgram Nova-3** — Arabic locales including `ar-MA` and `ar-EG`, plus multilingual mode.
- **Gemini API / Gemini 3.5 Transcribe** — dedicated audio transcription with automatic language detection and code-switching.
- **Google Cloud Speech-to-Text V2 / Chirp 3** — `chirp_3`, including `ar-MA`, `ar-EG` and automatic language detection.

For the optional second step — translating/adapting the transcript into another language or dialect — there are three engines:

- **Groq Cloud + Qwen 3.8 27B** — default cloud option.
- **Gemini** — cloud fallback you can switch to manually.
- **NLLB-200 distilled 600M** — local/free fallback.

Examples:

- Moroccan Darija audio → Moroccan Darija text
- Moroccan Darija audio → Egyptian Arabic text
- English audio → Egyptian Arabic text
- French audio → Moroccan Darija text
- Egyptian Arabic audio → French text

The extension records only after an explicit click, sends the recording only after Stop, and inserts the returned text into the focused field.

## Safety by default

This project is intentionally conservative about paid API usage:

- no background recording;
- no automatic STT-provider fallback;
- no automatic translation-provider fallback;
- no automatic retry from Groq to Gemini;
- no translation when output is **Same**;
- no translation when the selected source and output are already the same language/dialect;
- Groq is the default translation engine;
- maximum recording duration;
- daily and monthly local audio caps;
- per-provider monthly caps;
- separate daily/monthly caps for translation requests;
- Chirp 3 disabled by default;
- Gemini disabled by default in `.env.example`;
- API keys stay in the local server `.env`, never in the browser extension.

If Groq is unavailable or its free-tier limit is reached, the request fails visibly. You can then manually select **Gemini** in the extension. This avoids surprise paid fallback traffic.

## Quick start

### 1. Configure the local server

```bash
cd server
cp .env.example .env
npm install
npm test
npm start
```

Then edit `server/.env`.

Recommended starting configuration:

```env
DEEPGRAM_ENABLED=true
DEEPGRAM_API_KEY=your-deepgram-key

GEMINI_ENABLED=false
CHIRP_ENABLED=false

TRANSLATION_ENABLED=true
TRANSLATION_PROVIDER=groq
GROQ_API_KEY=your-groq-key
GROQ_TRANSLATION_MODEL=qwen/qwen3.8-27b
```

The gateway listens only on `127.0.0.1:3737` by default.

### 2. Load the extension

Chrome / Edge:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `extension/` directory.

Focus a normal text field on a website. The STT control appears in the bottom-right.

Choose:

1. transcription provider;
2. spoken language/dialect;
3. output language/dialect;
4. when conversion is needed, translation engine;
5. click **🎤**, speak, then click **■**.

## Translation providers

### Groq Cloud — default

Set:

```env
TRANSLATION_PROVIDER=groq
GROQ_API_KEY=...
GROQ_TRANSLATION_MODEL=qwen/qwen3.8-27b
```

The backend calls Groq's OpenAI-compatible Chat Completions endpoint.

The extension shows:

```text
☁️ Groq Cloud · Free
✨ Gemini
🌐 NLLB local · free
```

No automatic fallback occurs. If you want Gemini, select it explicitly.

### Gemini — manual fallback

Set:

```env
GEMINI_API_KEY=...
GEMINI_TEXT_MODEL=gemini-3.8-flash
```

You do not need to enable Gemini as an STT provider just to use its key for translation. Select **Gemini** from the translation selector when you want to compare quality.

### Local NLLB

Set:

```env
NLLB_ENABLED=true
NLLB_MODEL=Xenova/nllb-200-distilled-600M
NLLB_DTYPE=q8
```

No API key is required. NLLB needs an explicit source language when translation is required, so avoid **Auto** with this translation provider.

## Important: no translation is needed for Darija → Darija

If you select:

```text
Spoken: Moroccan Darija
Output: Moroccan Darija
```

the application returns the Deepgram transcript directly. It does not call Groq, Gemini, or NLLB.

## STT provider configuration

### Deepgram Nova-3

```env
DEEPGRAM_API_KEY=...
DEEPGRAM_ENABLED=true
```

### Gemini API

```env
GEMINI_API_KEY=...
GEMINI_ENABLED=true
GEMINI_MODEL=gemini-3.5-transcribe
GEMINI_MODE=SMART
```

### Chirp 3

Chirp 3 uses Google Cloud Speech-to-Text V2 and is separate from Gemini API billing.

```env
CHIRP_ENABLED=true
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_REGION=eu
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

## Local spending guardrails

Defaults in `.env.example`:

```env
MAX_RECORDING_SECONDS=60
DAILY_AUDIO_MINUTES_LIMIT=30
MONTHLY_AUDIO_MINUTES_LIMIT=300

DEEPGRAM_MONTHLY_AUDIO_MINUTES_LIMIT=300
GEMINI_MONTHLY_AUDIO_MINUTES_LIMIT=120
CHIRP_MONTHLY_AUDIO_MINUTES_LIMIT=15

DAILY_TRANSLATION_REQUEST_LIMIT=50
MONTHLY_TRANSLATION_REQUEST_LIMIT=500
```

Set any limit lower if you want a tighter local hard stop. Usage is stored only on your machine under `server/data/usage.json`.

## Security

The server binds to localhost only. Requests to the transcription endpoint require the extension client header and reject normal webpage origins.

Never commit `.env`, API keys, Google service-account JSON files, or any recorded audio.

## Current scope

- Chrome / Edge Manifest V3.
- Short dictation recordings (up to 60 seconds by default).
- Textareas, normal text inputs, and `contenteditable` editors.
- One explicit STT provider request per recording.
- Optional dialect/language conversion with Groq, Gemini, or local NLLB.

Future work can add real-time streaming, Firefox packaging, provider quality benchmarking, optional custom vocabulary, and a fully local/offline transcription engine.
