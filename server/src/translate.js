const TARGETS = {
  "ar-MA": "Moroccan Darija, written naturally in Arabic script",
  "ar-EG": "natural colloquial Egyptian Arabic, written in Arabic script",
  ar: "Modern Standard Arabic",
  fr: "natural French",
  en: "natural English",
};

export function buildTranslationPrompt(text, targetLanguage) {
  const target = TARGETS[targetLanguage];
  if (!target) {
    throw new Error("Unsupported translation target.");
  }

  return [
    `Convert the following text into ${target}.`,
    "Preserve the complete meaning, intent, names, numbers and tone.",
    "Use natural everyday wording for dialect targets, not Modern Standard Arabic disguised as dialect.",
    "Keep technical terms, brand names and unavoidable French/English loanwords when that is how a native speaker would naturally say them.",
    "Do not explain, summarize, annotate, quote, or add anything.",
    "Return only the converted text.",
    "",
    text,
  ].join("\n");
}

export async function convertTranscript({
  text,
  targetLanguage,
  apiKey,
  model,
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
          parts: [{ text: buildTranslationPrompt(text, targetLanguage) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    const detail = body?.error?.message || response.statusText;
    throw new Error(`Gemini conversion request failed: ${detail}`);
  }

  const converted =
    body?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "";

  if (!converted) {
    throw new Error("Gemini returned an empty converted transcript.");
  }

  return converted;
}
