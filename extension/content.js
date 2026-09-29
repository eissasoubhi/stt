(() => {
  const MAX_RECORDING_MS = 60_000;

  let target = null;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let stopTimer = null;

  const widget = document.createElement("div");
  widget.id = "stt-dictation-widget";
  widget.innerHTML = `
    <select id="stt-provider" aria-label="STT provider">
      <option value="deepgram">Deepgram</option>
      <option value="gemini">Gemini</option>
      <option value="chirp">Chirp 3</option>
    </select>
    <select id="stt-language" aria-label="Spoken language">
      <option value="auto">🎙️ Auto</option>
      <option value="ar-MA">🎙️ 🇲🇦 Darija</option>
      <option value="ar-EG">🎙️ 🇪🇬 Egyptian</option>
      <option value="ar">🎙️ العربية</option>
      <option value="fr">🎙️ Français</option>
      <option value="en">🎙️ English</option>
    </select>
    <select id="stt-output-language" aria-label="Output language">
      <option value="same">→ Same</option>
      <option value="ar-MA">→ 🇲🇦 Darija</option>
      <option value="ar-EG">→ 🇪🇬 Egyptian</option>
      <option value="ar">→ العربية الفصحى</option>
      <option value="fr">→ Français</option>
      <option value="en">→ English</option>
    </select>
    <select id="stt-translation-provider" aria-label="Translation provider" title="Translation engine">
      <option value="nllb">🌐 NLLB local · free</option>
      <option value="gemini">✨ Gemini</option>
    </select>
    <button id="stt-record-button" type="button" title="Start dictation">🎤</button>
    <span id="stt-status" aria-live="polite"></span>
  `;

  document.documentElement.appendChild(widget);

  const providerSelect = widget.querySelector("#stt-provider");
  const languageSelect = widget.querySelector("#stt-language");
  const outputLanguageSelect = widget.querySelector("#stt-output-language");
  const translationProviderSelect = widget.querySelector("#stt-translation-provider");
  const recordButton = widget.querySelector("#stt-record-button");
  const status = widget.querySelector("#stt-status");

  function needsConversion() {
    return (
      outputLanguageSelect.value !== "same" &&
      (languageSelect.value === "auto" ||
        outputLanguageSelect.value !== languageSelect.value)
    );
  }

  function updateTranslationProviderVisibility() {
    translationProviderSelect.hidden = !needsConversion();
  }

  chrome.storage.local
    .get(["provider", "language", "outputLanguage", "translationProvider"])
    .then((stored) => {
      if (stored.provider) providerSelect.value = stored.provider;
      if (stored.language) languageSelect.value = stored.language;
      if (stored.outputLanguage) outputLanguageSelect.value = stored.outputLanguage;
      translationProviderSelect.value = stored.translationProvider || "nllb";
      updateTranslationProviderVisibility();
    });

  providerSelect.addEventListener("change", () => {
    chrome.storage.local.set({ provider: providerSelect.value });
  });

  languageSelect.addEventListener("change", () => {
    chrome.storage.local.set({ language: languageSelect.value });
    updateTranslationProviderVisibility();
  });

  outputLanguageSelect.addEventListener("change", () => {
    chrome.storage.local.set({ outputLanguage: outputLanguageSelect.value });
    updateTranslationProviderVisibility();
  });

  translationProviderSelect.addEventListener("change", () => {
    chrome.storage.local.set({
      translationProvider: translationProviderSelect.value,
    });
  });

  function isEditable(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;

    if (element instanceof HTMLTextAreaElement) {
      return !element.disabled && !element.readOnly;
    }

    if (element instanceof HTMLInputElement) {
      const allowedTypes = new Set(["text", "search", "email", "url", "tel", ""]);
      return (
        allowedTypes.has((element.type || "").toLowerCase()) &&
        !element.disabled &&
        !element.readOnly
      );
    }

    return false;
  }

  document.addEventListener(
    "focusin",
    (event) => {
      if (isEditable(event.target)) {
        target = event.target;
        widget.classList.add("stt-visible");
        status.textContent = "";
      }
    },
    true,
  );

  function setBusy(busy) {
    providerSelect.disabled = busy;
    languageSelect.disabled = busy;
    outputLanguageSelect.disabled = busy;
    translationProviderSelect.disabled = busy;
    recordButton.disabled = busy;
  }

  function stopTracks() {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    stream = null;
  }

  function chooseMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/webm",
    ];

    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }

    return btoa(binary);
  }

  function dispatchInput(element, text) {
    try {
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text,
        }),
      );
    } catch {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function insertText(element, text) {
    if (!isEditable(element)) {
      throw new Error("The original text field is no longer editable.");
    }

    element.focus();

    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      const start = element.selectionStart ?? element.value.length;
      const end = element.selectionEnd ?? element.value.length;
      element.setRangeText(text, start, end, "end");
      dispatchInput(element, text);
      return;
    }

    const selection = window.getSelection();
    let range;

    if (
      selection &&
      selection.rangeCount > 0 &&
      element.contains(selection.anchorNode)
    ) {
      range = selection.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
    }

    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);

    selection?.removeAllRanges();
    selection?.addRange(range);
    dispatchInput(element, text);
  }

  async function sendRecording(blob, durationMs) {
    setBusy(true);
    status.textContent =
      needsConversion() ? "Transcribing + translating…" : "Transcribing…";

    try {
      const audioBase64 = arrayBufferToBase64(await blob.arrayBuffer());

      const response = await chrome.runtime.sendMessage({
        type: "STT_TRANSCRIBE",
        payload: {
          audioBase64,
          durationMs,
          mimeType: blob.type || "audio/webm",
          provider: providerSelect.value,
          language: languageSelect.value,
          outputLanguage: outputLanguageSelect.value,
          translationProvider: translationProviderSelect.value,
        },
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Transcription failed.");
      }

      insertText(target, response.text);
      status.textContent = response.converted
        ? "Translated + inserted ✓"
        : "Inserted ✓";
      setTimeout(() => {
        if (status.textContent.endsWith("✓")) status.textContent = "";
      }, 2500);
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Transcription failed.";
    } finally {
      setBusy(false);
      updateTranslationProviderVisibility();
    }
  }

  async function startRecording() {
    if (!target) {
      status.textContent = "Focus a text field first.";
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];

      const mimeType = chooseMimeType();
      recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) chunks.push(event.data);
      });

      recorder.addEventListener(
        "stop",
        async () => {
          clearTimeout(stopTimer);
          const durationMs = Math.max(1, Date.now() - startedAt);
          const blob = new Blob(chunks, {
            type: recorder.mimeType || mimeType || "audio/webm",
          });

          recordButton.classList.remove("stt-recording");
          recordButton.textContent = "🎤";
          recordButton.title = "Start dictation";
          stopTracks();

          if (blob.size > 0) {
            await sendRecording(blob, durationMs);
          }
        },
        { once: true },
      );

      recorder.start();
      startedAt = Date.now();
      recordButton.classList.add("stt-recording");
      recordButton.textContent = "■";
      recordButton.title = "Stop and transcribe";
      status.textContent = "Recording…";

      stopTimer = setTimeout(() => {
        if (recorder?.state === "recording") recorder.stop();
      }, MAX_RECORDING_MS);
    } catch (error) {
      stopTracks();
      status.textContent =
        error instanceof Error ? error.message : "Microphone unavailable.";
    }
  }

  recordButton.addEventListener("click", async () => {
    if (recorder?.state === "recording") {
      recorder.stop();
      return;
    }

    await startRecording();
  });
})();
