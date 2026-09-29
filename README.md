# STT — Arabic voice dictation

Browser extension + local Node.js gateway for **voice → text** dictation on websites.

The current version supports three transcription providers:

- **Deepgram Nova-3** — Arabic locales including `ar-MA` and `ar-EG`, plus multilingual mode.
- **Gemini API / Gemini 3.5 Transcribe** — dedicated audio transcription with automatic language detection and code-switching.
- **Google Cloud Speech-to-Text V2 / Chirp 3** — `chirp_3`, including `ar-MA`, `ar-EG` and automatic language detection.

For the optional second step — translating/adapting the transcript into another language or dialect — there are now two engines:

- **NLLB-200 distilled 600M, local** — free, no API key, no per-request billing.
- **Gemini** — cloud API option.

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
- no automatic cross-provider retry;
- no translation when output is **Same**;
- no translation when the selected source and output are already the same language/dialect;
- local NLLB is the default translation engine;
- maximum recording duration;
- daily and monthly local audio caps;
- per-provider monthly caps;
- separate daily/monthly caps for translation requests;
- Chirp 3 disabled by default;
- Gemini disabled by default in `.env.example`;
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

For a Deepgram-only start:

```env
DEEPGRAM_ENABLED=true
DEEPGRAM_API_KEY=your-key

GEMINI_ENABLED=false
CHIRP_ENABLED=false

TRANSLATION_ENABLED=true
TRANSLATION_PROVIDER=nllb
NLLB_ENABLED=true
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

## Free local translation with NLLB

The default translation engine is:

```text
Xenova/nllb-200-distilled-600M
```

It runs locally through Transformers.js/ONNX. No translation API key or payment method is needed.

The model has direct language codes for the dialects used by this project:

```text
Moroccan Arabic  ary_Arab
Egyptian Arabic  arz_Arab
Standard Arabic  arb_Arab
French           fra_Latn
English          eng_Latn
```

The model files are downloaded on first use and then cached locally. The first translation therefore takes longer than subsequent ones.

NLLB needs to know the source language. When using **NLLB local**, choose an explicit spoken language/dialect instead of **Auto** when translation is required.

NLLB-200 distilled 600M is licensed CC-BY-NC-4.0. Check the model license before using it for a commercial product.

### Important: no translation is needed for Darija → Darija

If you select:

```text
Spoken: Moroccan Darija
Output: Moroccan Darija
```

the application now returns the Deepgram transcript directly. It does **not** call Gemini or NLLB.

## Provider configuration

### Deepgram Nova-3

Create a Deepgram API key and set:

```env
DEEPGRAM_API_KEY=...
DEEPGRAM_ENABLED=true
```

The known-dialect selections map to their language codes.

### Gemini API

Gemini is optional:

```env
GEMINI_API_KEY=...
GEMINI_ENABLED=true
GEMINI_MODEL=gemini-3.5-transcribe
GEMINI_MODE=SMART
```

To use Gemini for text conversion instead of local NLLB:

```env
TRANSLATION_PROVIDER=gemini
GEMINI_TEXT_MODEL=gemini-3.8-flash
```

You can also choose **Gemini** from the translation-engine selector in the extension.

### Local NLLB

Defaults:

```env
TRANSLATION_ENABLED=true
TRANSLATION_PROVIDER=nllb
NLLB_ENABLED=true
NLLB_MODEL=Xenova/nllb-200-distilled-600M
NLLB_DTYPE=q8
```

No API key is required.

### Chirp 3

Chirp 3 uses Google Cloud Speech-to-Text V2 and is **separate from Gemini API billing**.

Enable the Speech-to-Text API in your Google Cloud project, configure Application Default Credentials, then set:

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
- Optional dialect/language conversion with either local NLLB or Gemini.

Future work can add real-time streaming, Firefox packaging, provider quality benchmarking, optional custom vocabulary, and a fully local/offline transcription engine.
