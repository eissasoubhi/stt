import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { config, isProviderConfigured, isTranslationConfigured } from "./config.js";
import { UsageLimitError, UsageLimiter } from "./usage.js";
import { transcribeWithDeepgram } from "./providers/deepgram.js";
import { transcribeWithGemini } from "./providers/gemini.js";
import { transcribeWithChirp } from "./providers/chirp.js";
import { convertTranscript } from "./translate.js";
import { convertTranscriptWithNllb } from "./translation/nllb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usage = new UsageLimiter(path.resolve(__dirname, "../data/usage.json"));
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));

const requestTimes = [];
const SOURCE_LANGUAGES = new Set(["auto", "ar-MA", "ar-EG", "ar", "fr", "en"]);
const OUTPUT_LANGUAGES = new Set(["same", "ar-MA", "ar-EG", "ar", "fr", "en"]);
const TRANSLATION_PROVIDERS = new Set(["nllb", "gemini"]);

function normalizeMimeType(value) {
  const mimeType = String(value || "audio/webm").split(";")[0].trim().toLowerCase();
  const allowed = new Set([
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/aac",
    "audio/flac",
    "audio/opus",
  ]);

  if (!allowed.has(mimeType)) {
    throw new Error(`Unsupported audio MIME type: ${mimeType}`);
  }

  return mimeType;
}

function extensionRequestGuard(req, res, next) {
  const origin = req.get("origin");

  if (
    origin &&
    !origin.startsWith("chrome-extension://") &&
    !origin.startsWith("moz-extension://")
  ) {
    return res.status(403).json({ error: "Browser page origins are not allowed." });
  }

  if (req.get("x-stt-client") !== "browser-extension-v1") {
    return res.status(403).json({ error: "Missing STT extension client header." });
  }

  const now = Date.now();
  while (requestTimes.length && requestTimes[0] < now - 60_000) {
    requestTimes.shift();
  }

  if (requestTimes.length >= config.requestsPerMinuteLimit) {
    return res.status(429).json({ error: "Local request rate limit reached." });
  }

  requestTimes.push(now);
  next();
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    providers: Object.fromEntries(
      Object.keys(config.providers).map((name) => [
        name,
        {
          enabled: config.providers[name].enabled,
          configured: isProviderConfigured(name),
        },
      ]),
    ),
    translation: {
      enabled: config.translation.enabled,
      defaultProvider: config.translation.defaultProvider,
      providers: {
        nllb: {
          configured: isTranslationConfigured("nllb"),
          model: config.translation.nllb.model,
          local: true,
        },
        gemini: {
          configured: isTranslationConfigured("gemini"),
          model: config.translation.gemini.model,
          local: false,
        },
      },
    },
    usage: usage.snapshot(),
  });
});

app.post("/v1/transcribe", extensionRequestGuard, async (req, res) => {
  try {
    const {
      audioBase64,
      durationMs,
      language = "auto",
      outputLanguage = "same",
      provider = "deepgram",
      translationProvider = config.translation.defaultProvider,
      mimeType: rawMimeType = "audio/webm",
    } = req.body || {};

    if (!["deepgram", "gemini", "chirp"].includes(provider)) {
      return res.status(400).json({ error: "Unknown provider." });
    }

    if (!SOURCE_LANGUAGES.has(language)) {
      return res.status(400).json({ error: "Unsupported source language selection." });
    }

    if (!OUTPUT_LANGUAGES.has(outputLanguage)) {
      return res.status(400).json({ error: "Unsupported output language selection." });
    }

    if (!TRANSLATION_PROVIDERS.has(translationProvider)) {
      return res.status(400).json({ error: "Unknown translation provider." });
    }

    if (!isProviderConfigured(provider)) {
      return res.status(503).json({
        error: `${provider} is disabled or not configured on the local gateway.`,
      });
    }

    const needsConversion =
      outputLanguage !== "same" &&
      (language === "auto" || outputLanguage !== language);

    if (needsConversion && !isTranslationConfigured(translationProvider)) {
      const hint =
        translationProvider === "gemini"
          ? "GEMINI_API_KEY is not configured."
          : "Local NLLB translation is disabled.";
      return res.status(503).json({
        error: `Translation provider ${translationProvider} is unavailable. ${hint}`,
      });
    }

    const numericDurationMs = Number(durationMs);
    if (
      !Number.isFinite(numericDurationMs) ||
      numericDurationMs <= 0 ||
      numericDurationMs > config.maxRecordingSeconds * 1000 + 1500
    ) {
      return res.status(400).json({ error: "Invalid or too-long recording duration." });
    }

    if (typeof audioBase64 !== "string" || audioBase64.length === 0) {
      return res.status(400).json({ error: "Missing audio data." });
    }

    const audio = Buffer.from(audioBase64, "base64");
    if (!audio.length || audio.length > config.maxAudioBytes) {
      return res.status(413).json({ error: "Audio payload is empty or too large." });
    }

    const mimeType = normalizeMimeType(rawMimeType);
    const providerConfig = config.providers[provider];

    usage.reserve({
      provider,
      durationMs: numericDurationMs,
      limits: {
        dailyMinutes: config.dailyAudioMinutesLimit,
        monthlyMinutes: config.monthlyAudioMinutesLimit,
        providerMonthlyMinutes: providerConfig.monthlyAudioMinutesLimit,
      },
    });

    let transcript;

    if (provider === "deepgram") {
      transcript = await transcribeWithDeepgram({
        audio,
        mimeType,
        language,
        apiKey: providerConfig.apiKey,
      });
    } else if (provider === "gemini") {
      transcript = await transcribeWithGemini({
        audio,
        mimeType,
        apiKey: providerConfig.apiKey,
        model: providerConfig.model,
        mode: providerConfig.mode,
      });
    } else {
      transcript = await transcribeWithChirp({
        audio,
        language,
        projectId: providerConfig.projectId,
        region: providerConfig.region,
      });
    }

    let text = transcript;

    if (needsConversion) {
      usage.reserveTranslation({
        dailyLimit: config.translation.dailyRequestLimit,
        monthlyLimit: config.translation.monthlyRequestLimit,
      });

      if (translationProvider === "nllb") {
        text = await convertTranscriptWithNllb({
          text: transcript,
          sourceLanguage: language,
          targetLanguage: outputLanguage,
          model: config.translation.nllb.model,
          dtype: config.translation.nllb.dtype,
        });
      } else {
        text = await convertTranscript({
          text: transcript,
          targetLanguage: outputLanguage,
          apiKey: config.providers.gemini.apiKey,
          model: config.translation.gemini.model,
        });
      }
    }

    return res.json({
      text,
      transcript,
      provider,
      language,
      outputLanguage,
      translationProvider: needsConversion ? translationProvider : null,
      converted: needsConversion,
    });
  } catch (error) {
    if (error instanceof UsageLimitError) {
      return res.status(429).json({ error: error.message });
    }

    console.error(error);
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Transcription failed.",
    });
  }
});

app.listen(config.port, config.host, () => {
  console.log(`STT gateway listening on http://${config.host}:${config.port}`);
});
