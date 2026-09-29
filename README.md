# STT — Arabic voice dictation

Browser extension + local Node.js gateway for **voice → text** dictation on websites.

The first version supports three transcription providers:

- **Deepgram Nova-3** — Arabic locales including `ar-MA` and `ar-EG`, plus multilingual mode.
- **Gemini API / Gemini 3.5 Transcribe** — dedicated audio transcription with automatic language detection and code-switching.
- **Google Cloud Speech-to-Text V2 / Chirp 3** — `chirp_3`, including `ar-MA`, `ar-EG` and automatic language detection.

It also supports an optional second step using Gemini text generation to convert the transcript into another language or dialect.

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
- no automatic provider fallback;
- no automatic cross-provider retry;
- no automatic translation unless an output different from **Same** is explicitly selected;
- maximum recording duration;
- daily and monthly local audio caps;
- per-provider monthly caps;
- separate daily/monthly caps for dialect/language conversion requests;
- Chirp 3 disabled by default;
- API keys stay in the local server `.env`, never in the browser extension.

These controls reduce accidental spend, but they do **not** replace provider-side billing controls.

## Quick start

### 1. Configure the local server

```bash
cd server
cp .env.example .env
npm install
npm test
npm start
```

Then edit `server/.env` and add at least one transcription provider credential.

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
4. click **🎤**, speak, then click **■**.

If Output is **Same**, only the STT provider is called. If another output is selected, the exact transcript is first produced and then converted with Gemini.

## Supported spoken-language choices

- Auto
- Moroccan Darija
- Egyptian Arabic
- Arabic
- French
- English

## Supported output choices

- Same as spoken
- Moroccan Darija
- Egyptian Arabic
- Modern Standard Arabic
- French
- English

## Provider configuration

### Deepgram Nova-3

Create a Deepgram API key and set:

```env
DEEPGRAM_API_KEY=...
DEEPGRAM_ENABLED=true
```

The known-dialect selections map to their language codes. Auto uses Nova-3 multilingual mode (`language=multi`) so mixed-language speech can be recognized without forcing Arabic.

### Gemini API

Set:

```env
GEMINI_API_KEY=...
GEMINI_ENABLED=true
GEMINI_MODEL=gemini-3.5-transcribe
GEMINI_MODE=SMART
```

Gemini transcription is left in automatic language detection mode so Darija/French/English code-switching is not artificially constrained.

The same `GEMINI_API_KEY` is used for optional transcript conversion:

```env
TRANSLATION_ENABLED=true
GEMINI_TEXT_MODEL=gemini-3.8-flash
DAILY_TRANSLATION_REQUEST_LIMIT=50
MONTHLY_TRANSLATION_REQUEST_LIMIT=500
```

Selecting Output = **Same** guarantees that this second Gemini text request is not made.

### Chirp 3

Chirp 3 uses Google Cloud Speech-to-Text V2 and is **separate from Gemini API billing**.

Enable the Speech-to-Text API in your Google Cloud project, configure Application Default Credentials (for example with a service-account JSON file), then set:

```env
CHIRP_ENABLED=true
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_REGION=eu
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

Auto maps to Chirp 3 automatic language detection.

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

The server binds to localhost only. Requests to the transcription endpoint require the extension client header and reject normal webpage origins. This prevents a random website from silently using the local gateway in the normal browser security model.

Never commit `.env`, API keys, Google service-account JSON files, or any recorded audio.

## Current scope

- Chrome / Edge Manifest V3.
- Short dictation recordings (up to 60 seconds by default).
- Textareas, normal text inputs, and `contenteditable` editors.
- One explicit STT provider request per recording.
- Optional one-shot text conversion using Gemini when a different output language/dialect is selected.

A future version can add real-time streaming, Firefox packaging, provider quality benchmarking, optional custom vocabulary, and a fully local/offline transcription engine.
