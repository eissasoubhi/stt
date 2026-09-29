# STT — Arabic voice dictation

Browser extension + local Node.js gateway for **voice → text** dictation on websites.

The first version supports three providers:

- **Deepgram Nova-3** — Arabic locales including `ar-MA` and `ar-EG`.
- **Gemini API / Gemini 3.5 Transcribe** — dedicated audio transcription with automatic language detection and code-switching.
- **Google Cloud Speech-to-Text V2 / Chirp 3** — `chirp_3`, including `ar-MA` and `ar-EG`.

The extension records only after an explicit click, sends the recording only after Stop, and inserts the returned transcript into the focused text field.

## Safety by default

This project is intentionally conservative about paid API usage:

- no background recording;
- no automatic provider fallback;
- no automatic cross-provider retry;
- maximum recording duration;
- daily and monthly local usage caps;
- per-provider monthly caps;
- Chirp 3 disabled by default;
- API keys stay in the local server `.env`, never in the browser extension.

These controls reduce accidental spend, but they do **not** replace provider-side billing controls. If you only want to use Deepgram promotional credit, do not add a payment method unless Deepgram requires it for your account.

## Quick start

### 1. Configure the local server

```bash
cd server
cp .env.example .env
npm install
npm test
npm start
```

Then edit `server/.env` and add at least one provider credential.

The gateway listens only on `127.0.0.1:3737` by default.

### 2. Load the extension

Chrome / Edge:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `extension/` directory.

Focus a normal text field on a website. A small STT control appears in the bottom-right. Select a provider and dialect, click **🎤**, speak, then click **■**. The transcript is inserted into the field.

## Provider configuration

### Deepgram Nova-3

Create a Deepgram API key and set:

```env
DEEPGRAM_API_KEY=...
DEEPGRAM_ENABLED=true
```

The dialect selector maps directly to `ar-MA` or `ar-EG`. Auto uses generic Arabic `ar`.

### Gemini API

Set:

```env
GEMINI_API_KEY=...
GEMINI_ENABLED=true
GEMINI_MODEL=gemini-3.5-transcribe
GEMINI_MODE=SMART
```

Gemini is left in automatic language detection mode so Darija/French/English code-switching is not artificially constrained.

### Chirp 3

Chirp 3 uses Google Cloud Speech-to-Text V2 and is **separate from Gemini API billing**.

Enable the Speech-to-Text API in your Google Cloud project, configure Application Default Credentials (for example with a service-account JSON file), then set:

```env
CHIRP_ENABLED=true
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_REGION=eu
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

The extension maps the dialect selector to `ar-MA`, `ar-EG`, or Chirp automatic detection.

## Local spending guardrails

Defaults in `.env.example`:

```env
MAX_RECORDING_SECONDS=60
DAILY_AUDIO_MINUTES_LIMIT=30
MONTHLY_AUDIO_MINUTES_LIMIT=300

DEEPGRAM_MONTHLY_AUDIO_MINUTES_LIMIT=300
GEMINI_MONTHLY_AUDIO_MINUTES_LIMIT=120
CHIRP_MONTHLY_AUDIO_MINUTES_LIMIT=15
```

Set a provider limit to a smaller value if you want a tighter local hard stop. Usage is stored only on your machine under `server/data/usage.json`.

## Security

The server binds to localhost only. Requests to the transcription endpoint require the extension client header and reject normal webpage origins. This prevents a random website from silently using the local gateway in the normal browser security model.

Never commit `.env`, API keys, Google service-account JSON files, or any recorded audio.

## Current scope

- Chrome / Edge Manifest V3.
- Short dictation recordings (up to 60 seconds by default).
- Textareas, normal text inputs, and `contenteditable` editors.
- One explicit provider request per recording.

A future version can add real-time streaming, Firefox packaging, provider quality benchmarking, and optional custom vocabulary.
