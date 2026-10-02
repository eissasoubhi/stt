const LANGUAGE_CODES = {
  "ar-MA": "ary_Arab",
  "ar-EG": "arz_Arab",
  ar: "arb_Arab",
  fr: "fra_Latn",
  en: "eng_Latn",
};

let translatorPromise;
let loadedModel;

export function nllbLanguageCode(language) {
  return LANGUAGE_CODES[language] || null;
}

function splitText(text, maxChars = 700) {
  const normalized = text.trim();
  if (normalized.length <= maxChars) return [normalized];

  const sentences = normalized
    .split(/(?<=[.!?؟。！？])\s+/u)
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const sentence of sentences.length ? sentences : [normalized]) {
    if (!current) {
      current = sentence;
      continue;
    }

    if ((current + " " + sentence).length <= maxChars) {
      current += " " + sentence;
      continue;
    }

    chunks.push(current);
    current = sentence;
  }

  if (current) chunks.push(current);

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk];

    const parts = [];
    for (let i = 0; i < chunk.length; i += maxChars) {
      parts.push(chunk.slice(i, i + maxChars));
    }
    return parts;
  });
}

async function getTranslator({ model, dtype }) {
  if (!translatorPromise || loadedModel !== model) {
    const { pipeline } = await import("@huggingface/transformers");
    loadedModel = model;
    translatorPromise = pipeline("translation", model, {
      dtype,
    }).catch((error) => {
      translatorPromise = undefined;
      loadedModel = undefined;
      throw error;
    });
  }

  return translatorPromise;
}

export async function convertTranscriptWithNllb({
  text,
  sourceLanguage,
  targetLanguage,
  model,
  dtype,
}) {
  if (sourceLanguage === "auto") {
    throw new Error(
      "Local NLLB translation needs an explicit spoken language. Choose Darija, Egyptian, Arabic, French, or English instead of Auto.",
    );
  }

  const srcLang = nllbLanguageCode(sourceLanguage);
  const tgtLang = nllbLanguageCode(targetLanguage);

  if (!srcLang || !tgtLang) {
    throw new Error("Local NLLB does not support this language selection.");
  }

  if (srcLang === tgtLang) {
    return text;
  }

  const translator = await getTranslator({ model, dtype });
  const chunks = splitText(text);
  const translated = [];

  for (const chunk of chunks) {
    const output = await translator(chunk, {
      src_lang: srcLang,
      tgt_lang: tgtLang,
      max_new_tokens: 256,
    });

    const value = Array.isArray(output)
      ? output[0]?.translation_text
      : output?.translation_text;

    if (!value?.trim()) {
      throw new Error("Local NLLB returned an empty translation.");
    }

    translated.push(value.trim());
  }

  return translated.join(" ");
}
