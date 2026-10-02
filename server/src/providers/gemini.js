export async function transcribeWithGemini({
  audio,
  mimeType,
  apiKey,
  model,
  mode,
}) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: audio.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: {
        audioTranscriptionConfig: {
          languageCodes: [],
          mode,
        },
      },
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    const detail = body?.error?.message || response.statusText;
    throw new Error(`Gemini request failed: ${detail}`);
  }

  const transcript =
    body?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "";

  if (!transcript) {
    throw new Error("Gemini returned an empty transcript.");
  }

  return transcript;
}
