(() => {
  const MAX_RECORDING_MS = 60_000;
  const DISPLAY_MODES = new Set(["full", "medium", "compact"]);
  const VIEWPORT_MARGIN = 8;

  let target = null;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let stopTimer = null;
  let currentMode = "medium";
  let hasCustomPosition = false;
  let dragState = null;

  const widget = document.createElement("div");
  widget.id = "stt-dictation-widget";
  widget.dataset.mode = currentMode;
  widget.innerHTML = `
    <div id="stt-widget-header" class="stt-widget-header" title="Drag to move">
      <div class="stt-widget-brand">
        <span class="stt-drag-grip" aria-hidden="true">⋮⋮</span>
        <span class="stt-widget-title">Voice STT</span>
      </div>

      <div class="stt-mode-switcher" role="group" aria-label="Display mode">
        <button type="button" class="stt-mode-button" data-stt-mode="full" title="Full mode" aria-label="Full mode">▣</button>
        <button type="button" class="stt-mode-button" data-stt-mode="medium" title="Medium mode" aria-label="Medium mode">▬</button>
        <button type="button" class="stt-mode-button" data-stt-mode="compact" title="Reduced mode" aria-label="Reduced mode">●</button>
      </div>
    </div>

    <div class="stt-widget-body">
      <div class="stt-field stt-full-only">
        <label for="stt-provider">Transcription</label>
        <select id="stt-provider" aria-label="STT provider">
          <option value="deepgram">Deepgram</option>
          <option value="gemini">Gemini</option>
          <option value="chirp">Chirp 3</option>
        </select>
      </div>

      <div class="stt-field stt-common-control">
        <label for="stt-language">Spoken</label>
        <select id="stt-language" aria-label="Spoken language">
          <option value="auto">🎙️ Auto</option>
          <option value="ar-MA">🎙️ 🇲🇦 Darija</option>
          <option value="ar-EG">🎙️ 🇪🇬 Egyptian</option>
          <option value="ar">🎙️ العربية</option>
          <option value="fr">🎙️ Français</option>
          <option value="en">🎙️ English</option>
        </select>
      </div>

      <div class="stt-field stt-common-control">
        <label for="stt-output-language">Output</label>
        <select id="stt-output-language" aria-label="Output language">
          <option value="same">→ Same</option>
          <option value="ar-MA">→ 🇲🇦 Darija</option>
          <option value="ar-EG">→ 🇪🇬 Egyptian</option>
          <option value="ar">→ العربية الفصحى</option>
          <option value="fr">→ Français</option>
          <option value="en">→ English</option>
        </select>
      </div>

      <div id="stt-translation-field" class="stt-field stt-full-only">
        <label for="stt-translation-provider">Translation</label>
        <select id="stt-translation-provider" aria-label="Translation provider" title="Translation engine">
          <option value="groq">☁️ Groq Cloud · Free</option>
          <option value="gemini">✨ Gemini</option>
          <option value="nllb">🌐 NLLB local · free</option>
        </select>
      </div>

      <div class="stt-action-row">
        <button id="stt-record-button" type="button" title="Start dictation" aria-label="Start dictation">🎤</button>
        <span id="stt-status" aria-live="polite"></span>
      </div>
    </div>
  `;

  document.documentElement.appendChild(widget);

  const header = widget.querySelector("#stt-widget-header");
  const providerSelect = widget.querySelector("#stt-provider");
  const languageSelect = widget.querySelector("#stt-language");
  const outputLanguageSelect = widget.querySelector("#stt-output-language");
  const translationProviderSelect = widget.querySelector("#stt-translation-provider");
  const translationField = widget.querySelector("#stt-translation-field");
  const recordButton = widget.querySelector("#stt-record-button");
  const status = widget.querySelector("#stt-status");
  const modeButtons = [...widget.querySelectorAll("[data-stt-mode]")];

  function needsConversion() {
    return (
      outputLanguageSelect.value !== "same" &&
      (languageSelect.value === "auto" ||
        outputLanguageSelect.value !== languageSelect.value)
    );
  }

  function updateTranslationProviderVisibility() {
    translationField.hidden = !needsConversion();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function getCurrentPosition() {
    const rect = widget.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
    };
  }

  function applyPosition(position) {
    if (
      !position ||
      !Number.isFinite(position.left) ||
      !Number.isFinite(position.top)
    ) {
      return;
    }

    hasCustomPosition = true;
    widget.style.right = "auto";
    widget.style.bottom = "auto";
    widget.style.left = `${position.left}px`;
    widget.style.top = `${position.top}px`;
  }

  function clampWidgetToViewport({ persist = false } = {}) {
    if (!hasCustomPosition || !widget.classList.contains("stt-visible")) {
      return;
    }

    const rect = widget.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - rect.height - VIEWPORT_MARGIN;

    const left = clamp(rect.left, VIEWPORT_MARGIN, maxLeft);
    const top = clamp(rect.top, VIEWPORT_MARGIN, maxTop);

    widget.style.left = `${Math.round(left)}px`;
    widget.style.top = `${Math.round(top)}px`;

    if (persist) {
      chrome.storage.local.set({
        widgetPosition: {
          left: Math.round(left),
          top: Math.round(top),
        },
      });
    }
  }

  function applyDisplayMode(mode, { persist = true } = {}) {
    const nextMode = DISPLAY_MODES.has(mode) ? mode : "medium";
    currentMode = nextMode;
    widget.dataset.mode = nextMode;

    for (const button of modeButtons) {
      const active = button.dataset.sttMode === nextMode;
      button.classList.toggle("stt-mode-active", active);
      button.setAttribute("aria-pressed", String(active));
    }

    if (persist) {
      chrome.storage.local.set({ widgetDisplayMode: nextMode });
    }

    requestAnimationFrame(() => clampWidgetToViewport({ persist: hasCustomPosition }));
  }

  chrome.storage.local
    .get([
      "provider",
      "language",
      "outputLanguage",
      "translationProvider",
      "widgetDisplayMode",
      "widgetPosition",
    ])
    .then((stored) => {
      if (stored.provider) providerSelect.value = stored.provider;
      if (stored.language) languageSelect.value = stored.language;
      if (stored.outputLanguage) outputLanguageSelect.value = stored.outputLanguage;
      translationProviderSelect.value = stored.translationProvider || "groq";

      applyDisplayMode(stored.widgetDisplayMode || "medium", { persist: false });
      applyPosition(stored.widgetPosition);
      updateTranslationProviderVisibility();
    });

  for (const button of modeButtons) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      applyDisplayMode(button.dataset.sttMode);
    });
  }

  providerSelect.addEventListener("change", () => {
    chrome.storage.local.set({ provider: providerSelect.value });
  });

  languageSelect.addEventListener("change", () => {
    chrome.storage.local.set({ language: languageSelect.value });
    updateTranslationProviderVisibility();
    requestAnimationFrame(() => clampWidgetToViewport({ persist: hasCustomPosition }));
  });

  outputLanguageSelect.addEventListener("change", () => {
    chrome.storage.local.set({ outputLanguage: outputLanguageSelect.value });
    updateTranslationProviderVisibility();
    requestAnimationFrame(() => clampWidgetToViewport({ persist: hasCustomPosition }));
  });

  translationProviderSelect.addEventListener("change", () => {
    chrome.storage.local.set({
      translationProvider: translationProviderSelect.value,
    });
  });

  function startDrag(event) {
    if (event.button !== 0 || event.target.closest("button, select, input")) {
      return;
    }

    const rect = widget.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    hasCustomPosition = true;
    widget.style.right = "auto";
    widget.style.bottom = "auto";
    widget.style.left = `${Math.round(rect.left)}px`;
    widget.style.top = `${Math.round(rect.top)}px`;
    widget.classList.add("stt-dragging");
    header.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const width = widget.offsetWidth;
    const height = widget.offsetHeight;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - height - VIEWPORT_MARGIN;

    const left = clamp(
      event.clientX - dragState.offsetX,
      VIEWPORT_MARGIN,
      maxLeft,
    );
    const top = clamp(
      event.clientY - dragState.offsetY,
      VIEWPORT_MARGIN,
      maxTop,
    );

    widget.style.left = `${Math.round(left)}px`;
    widget.style.top = `${Math.round(top)}px`;
    event.preventDefault();
  }

  function endDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragState = null;
    widget.classList.remove("stt-dragging");

    try {
      header.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }

    chrome.storage.local.set({
      widgetPosition: getCurrentPosition(),
    });
  }

  header.addEventListener("pointerdown", startDrag);
  header.addEventListener("pointermove", moveDrag);
  header.addEventListener("pointerup", endDrag);
  header.addEventListener("pointercancel", endDrag);

  window.addEventListener("resize", () => {
    clampWidgetToViewport({ persist: hasCustomPosition });
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
        requestAnimationFrame(() => clampWidgetToViewport());
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
    for (const button of modeButtons) {
      button.disabled = busy;
    }
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
      requestAnimationFrame(() => clampWidgetToViewport());
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
          recordButton.setAttribute("aria-label", "Start dictation");
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
      recordButton.setAttribute("aria-label", "Stop and transcribe");
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
