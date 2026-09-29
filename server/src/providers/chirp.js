import speech from "@google-cloud/speech";

const { v2 } = speech;
const clients = new Map();

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

  const [response] = await client.recognize({
    recognizer: `projects/${projectId}/locations/${region}/recognizers/_`,
    config: {
      autoDecodingConfig: {},
      languageCodes: [language === "auto" ? "auto" : language],
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
