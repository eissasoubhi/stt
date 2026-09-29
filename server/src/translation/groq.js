import { buildTranslationPrompt } from "../translate.js";

export async function convertTranscriptWithGroq({
  text,
  targetLanguage,
  apiKey,
  model,
}) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a precise translation and dialect-adaptation engine. Return only the requested converted text.",
        },
        {
          role: "user",
          content: buildTranslationPrompt(text, targetLanguage),
        },
      ],
      temperature: 0.2,
      reasoning_effort: "none",
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    const detail = body?.error?.message || response.statusText;
    throw new Error(`Groq conversion request failed: ${detail}`);
  }

  const converted =
    body?.choices?.[0]?.message?.content?.trim() || "";

  if (!converted) {
    throw new Error("Groq returned an empty converted transcript.");
  }

  return converted;
}
