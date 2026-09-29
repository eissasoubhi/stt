export async function transcribeWithDeepgram({
  audio,
  mimeType,
  language,
  apiKey,
}) {
  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", "nova-3");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("language", language === "auto" ? "multi" : language);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": mimeType,
    },
    body: audio,
  });

  const body = await response.json();

  if (!response.ok) {
    const detail = body?.err_msg || body?.error || response.statusText;
    throw new Error(`Deepgram request failed: ${detail}`);
  }

  const transcript =
    body?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || "";

  if (!transcript) {
    throw new Error("Deepgram returned an empty transcript.");
  }

  return transcript;
}
