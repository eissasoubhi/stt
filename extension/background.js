const DEFAULT_BACKEND_URL = "http://127.0.0.1:3737";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "STT_TRANSCRIBE") {
    return false;
  }

  (async () => {
    try {
      const { backendUrl = DEFAULT_BACKEND_URL } =
        await chrome.storage.local.get("backendUrl");

      const response = await fetch(`${backendUrl.replace(/\/$/, "")}/v1/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-STT-Client": "browser-extension-v1",
        },
        body: JSON.stringify(message.payload),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error || `Gateway error ${response.status}`);
      }

      sendResponse({ ok: true, ...body });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Transcription failed.",
      });
    }
  })();

  return true;
});
