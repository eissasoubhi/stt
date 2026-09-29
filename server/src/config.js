import "dotenv/config";

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid numeric environment variable ${name}`);
  }
  return value;
}

function readBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const config = {
  host: process.env.HOST || "127.0.0.1",
  port: readNumber("PORT", 3737),

  maxRecordingSeconds: readNumber("MAX_RECORDING_SECONDS", 60),
  maxAudioBytes: readNumber("MAX_AUDIO_BYTES", 8 * 1024 * 1024),
  requestsPerMinuteLimit: readNumber("REQUESTS_PER_MINUTE_LIMIT", 8),
  dailyAudioMinutesLimit: readNumber("DAILY_AUDIO_MINUTES_LIMIT", 30),
  monthlyAudioMinutesLimit: readNumber("MONTHLY_AUDIO_MINUTES_LIMIT", 300),

  providers: {
    deepgram: {
      enabled: readBoolean("DEEPGRAM_ENABLED", true),
      apiKey: process.env.DEEPGRAM_API_KEY || "",
      monthlyAudioMinutesLimit: readNumber("DEEPGRAM_MONTHLY_AUDIO_MINUTES_LIMIT", 300),
    },
    gemini: {
      enabled: readBoolean("GEMINI_ENABLED", true),
      apiKey: process.env.GEMINI_API_KEY || "",
      model: process.env.GEMINI_MODEL || "gemini-3.5-transcribe",
      mode: process.env.GEMINI_MODE || "SMART",
      monthlyAudioMinutesLimit: readNumber("GEMINI_MONTHLY_AUDIO_MINUTES_LIMIT", 120),
    },
    chirp: {
      enabled: readBoolean("CHIRP_ENABLED", false),
      projectId: process.env.GOOGLE_CLOUD_PROJECT || "",
      region: process.env.GOOGLE_CLOUD_REGION || "eu",
      monthlyAudioMinutesLimit: readNumber("CHIRP_MONTHLY_AUDIO_MINUTES_LIMIT", 15),
    },
  },
};

export function isProviderConfigured(name) {
  const provider = config.providers[name];
  if (!provider?.enabled) return false;

  if (name === "deepgram" || name === "gemini") {
    return Boolean(provider.apiKey);
  }

  if (name === "chirp") {
    return Boolean(provider.projectId);
  }

  return false;
}
