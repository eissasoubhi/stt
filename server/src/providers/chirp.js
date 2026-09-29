import speech from "@google-cloud/speech";

const { v2 } = speech;
const clients = new Map();

const CHIRP_LANGUAGE_CODES = {
  auto: "auto",
  "ar-MA": "ar-MA",
  "ar-EG": "ar-EG",
  ar: "ar-XA",
  en: "en-US",
  fr: "fr-FR",
};

function clientFor(region) {
  if (!clients.has(region)) {
    clients.set(
      region,
      new v2.SpeechClient({
        apiEndpoint: `${region}-speech.googleapis.com`,
      }),
    );
  }

  return clients.get(region);
}

export async function transcribeWithChirp({
  audio,
  language,
  projectId,
  region,
}) {
  const client = clientFor(region);
  const languageCode = CHIRP_LANGUAGE_CODES[language];

  if (!languageCode) {
    throw new Error("Unsupported Chirp 3 source language.");
  }

  const [response] = await client.recognize({
    recognizer: `projects/${projectId}/locations/${region}/recognizers/_`,
    config: {
      autoDecodingConfig: {},
      languageCodes: [languageCode],
      model: "chirp_3",
    },
    content: audio,
  });

  const transcript = (response.results || [])
    .map((result) => result.alternatives?.[0]?.transcript || "")
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!transcript) {
    throw new Error("Chirp 3 returned an empty transcript.");
  }

  return transcript;
}
