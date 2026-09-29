const DEFAULT_BACKEND_URL = "http://127.0.0.1:3737";

const ROUTES = {
  STT_TRANSCRIBE: {
    path: "/v1/transcribe",
    fallbackError: "Transcription failed.",
  },
  TEXT_TRANSLATE: {
    path: "/v1/translate",
    fallbackError: "Translation failed.",
  },
};

function parseGatewayResponse(raw, contentType) {
  if (!raw) return {};

  if (contentType?.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("Le serveur local a renvoyé un JSON invalide.");
    }
  }

  try {
    return JSON.parse(raw);
  } catch {
    const looksLikeHtml = /^\s*</.test(raw);
    if (looksLikeHtml) {
      throw new Error(
        "Le serveur local ne connaît pas cette route. Mets le repo à jour puis redémarre le serveur avec npm start.",
      );
    }

    throw new Error("Réponse inattendue du serveur local.");
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const route = ROUTES[message?.type];
  if (!route) {
    return false;
  }

  (async () => {
    try {
      const { backendUrl = DEFAULT_BACKEND_URL } =
        await chrome.storage.local.get("backendUrl");

      const response = await fetch(
        `${backendUrl.replace(/\/$/, "")}${route.path}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-STT-Client": "browser-extension-v1",
          },
          body: JSON.stringify(message.payload),
        },
      );

      const raw = await response.text();
      const body = parseGatewayResponse(
        raw,
        response.headers.get("content-type"),
      );

      if (!response.ok) {
        throw new Error(body?.error || `Gateway error ${response.status}`);
      }

      sendResponse({ ok: true, ...body });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : route.fallbackError,
      });
    }
  })();

  return true;
});
