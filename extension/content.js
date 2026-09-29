(() => {
  const MAX_RECORDING_MS = 60_000;
  const DISPLAY_MODES = new Set(["full", "medium", "compact"]);
  const VIEWPORT_MARGIN = 8;
  const MAX_SAVED_PHRASES = 100;
  const MAX_PHRASE_LENGTH = 240;
  const ARABIC_SCRIPT_RE = /\p{Script=Arabic}/u;
  const LATIN_LETTER_RE = /[A-Za-z]/;

  let target = null;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let stopTimer = null;
  let recordingCancelled = false;
  let currentMode = "medium";
  let hasCustomPosition = false;
  let dragState = null;
  let savedPhrases = [];
  let editingPhraseId = null;

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

      <section id="stt-phrases-section" class="stt-phrases-section" aria-label="Saved Arabic phrases">
        <div class="stt-phrases-heading stt-full-only">
          <span>عبارات سريعة</span>
          <span id="stt-phrases-count" class="stt-phrases-count"></span>
        </div>

        <form id="stt-phrase-form" class="stt-phrase-form stt-full-only">
          <input
            id="stt-phrase-input"
            type="text"
            dir="rtl"
            maxlength="240"
            autocomplete="off"
            placeholder="أضف عبارة عربية…"
            aria-label="Arabic phrase"
          />
          <button id="stt-phrase-save" type="submit" title="Save phrase" aria-label="Save phrase">＋</button>
          <button id="stt-phrase-cancel-edit" type="button" title="Cancel edit" aria-label="Cancel edit" hidden>×</button>
        </form>

        <div id="stt-phrase-error" class="stt-phrase-error stt-full-only" aria-live="polite"></div>
        <div id="stt-phrase-list" class="stt-phrase-list"></div>
      </section>

      <div class="stt-action-row">
        <button id="stt-record-button" type="button" title="Start dictation" aria-label="Start dictation">🎤</button>
        <button id="stt-cancel-recording" type="button" title="Cancel recording" aria-label="Cancel recording" hidden>✕</button>
        <span id="stt-status" aria-live="polite"></span>
      </div>
    </div>
  `;

  document.documentElement.appendChild(widget);
  widget.classList.add("stt-visible");

  const header = widget.querySelector("#stt-widget-header");
  const providerSelect = widget.querySelector("#stt-provider");
  const languageSelect = widget.querySelector("#stt-language");
  const outputLanguageSelect = widget.querySelector("#stt-output-language");
  const translationProviderSelect = widget.querySelector("#stt-translation-provider");
  const translationField = widget.querySelector("#stt-translation-field");
  const recordButton = widget.querySelector("#stt-record-button");
  const cancelRecordingButton = widget.querySelector("#stt-cancel-recording");
  const status = widget.querySelector("#stt-status");
  const modeButtons = [...widget.querySelectorAll("[data-stt-mode]")];
  const phraseForm = widget.querySelector("#stt-phrase-form");
  const phraseInput = widget.querySelector("#stt-phrase-input");
  const phraseSaveButton = widget.querySelector("#stt-phrase-save");
  const phraseCancelEditButton = widget.querySelector("#stt-phrase-cancel-edit");
  const phraseError = widget.querySelector("#stt-phrase-error");
  const phraseList = widget.querySelector("#stt-phrase-list");
  const phrasesCount = widget.querySelector("#stt-phrases-count");

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

  function normalizePhraseText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function validateArabicPhrase(value) {
    const text = normalizePhraseText(value);

    if (!text) {
      return "اكتب عبارة أولاً.";
    }

    if (text.length > MAX_PHRASE_LENGTH) {
      return `الحد الأقصى هو ${MAX_PHRASE_LENGTH} حرفاً.`;
    }

    if (!ARABIC_SCRIPT_RE.test(text) || LATIN_LETTER_RE.test(text)) {
      return "العبارة يجب أن تكون بالعربية فقط.";
    }

    return "";
  }

  function normalizeStoredPhrase(item) {
    if (!item || typeof item !== "object") return null;
    const text = normalizePhraseText(item.text);
    if (!text || validateArabicPhrase(text)) return null;

    return {
      id: String(item.id || `phrase-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      text,
      useCount: Math.max(0, Number(item.useCount) || 0),
      lastUsedAt: Math.max(0, Number(item.lastUsedAt) || 0),
      createdAt: Math.max(0, Number(item.createdAt) || Date.now()),
    };
  }

  function sortPhrases(phrases) {
    return [...phrases].sort((a, b) => {
      if (b.useCount !== a.useCount) return b.useCount - a.useCount;
      if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt;
      return a.createdAt - b.createdAt;
    });
  }

  function savePhrases() {
    return chrome.storage.local.set({ savedArabicPhrases: savedPhrases });
  }

  function setPhraseError(message = "") {
    phraseError.textContent = message;
  }

  function resetPhraseEditor() {
    editingPhraseId = null;
    phraseInput.value = "";
    phraseSaveButton.textContent = "＋";
    phraseSaveButton.title = "Save phrase";
    phraseCancelEditButton.hidden = true;
    setPhraseError();
  }

  function renderPhrases() {
    const sorted = sortPhrases(savedPhrases);
    const visible = currentMode === "full" ? sorted : sorted.slice(0, 5);

    phrasesCount.textContent = savedPhrases.length
      ? `${savedPhrases.length}/${MAX_SAVED_PHRASES}`
      : "";

    phraseList.replaceChildren();

    if (currentMode === "compact") {
      return;
    }

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "stt-phrases-empty";
      empty.textContent =
        currentMode === "full"
          ? "أضف العبارات التي تستعملها كثيراً."
          : "لا توجد عبارات محفوظة.";
      phraseList.appendChild(empty);
      return;
    }

    for (const phrase of visible) {
      const row = document.createElement("div");
      row.className = "stt-phrase-row";

      const useButton = document.createElement("button");
      useButton.type = "button";
      useButton.className = "stt-phrase-use";
      useButton.dir = "rtl";
      useButton.dataset.phraseAction = "use";
      useButton.dataset.phraseId = phrase.id;
      useButton.title = phrase.text;
      useButton.textContent = phrase.text;

      if (phrase.useCount > 0) {
        const count = document.createElement("span");
        count.className = "stt-phrase-usage";
        count.textContent = String(phrase.useCount);
        count.title = `${phrase.useCount} use(s)`;
        useButton.appendChild(count);
      }

      row.appendChild(useButton);

      if (currentMode === "full") {
        const actions = document.createElement("div");
        actions.className = "stt-phrase-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "stt-phrase-icon-button";
        editButton.dataset.phraseAction = "edit";
        editButton.dataset.phraseId = phrase.id;
        editButton.title = "Edit phrase";
        editButton.setAttribute("aria-label", "Edit phrase");
        editButton.textContent = "✎";

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "stt-phrase-icon-button stt-phrase-delete";
        deleteButton.dataset.phraseAction = "delete";
        deleteButton.dataset.phraseId = phrase.id;
        deleteButton.title = "Delete phrase";
        deleteButton.setAttribute("aria-label", "Delete phrase");
        deleteButton.textContent = "🗑";

        actions.append(editButton, deleteButton);
        row.appendChild(actions);
      }

      phraseList.appendChild(row);
    }
  }

  async function addOrUpdatePhrase() {
    const text = normalizePhraseText(phraseInput.value);
    const validationError = validateArabicPhrase(text);

    if (validationError) {
      setPhraseError(validationError);
      return;
    }

    const duplicate = savedPhrases.find(
      (phrase) =>
        phrase.text === text &&
        phrase.id !== editingPhraseId,
    );

    if (duplicate) {
      setPhraseError("هذه العبارة موجودة بالفعل.");
      return;
    }

    if (editingPhraseId) {
      const phrase = savedPhrases.find((item) => item.id === editingPhraseId);
      if (!phrase) {
        resetPhraseEditor();
        return;
      }
      phrase.text = text;
    } else {
      if (savedPhrases.length >= MAX_SAVED_PHRASES) {
        setPhraseError(`يمكنك حفظ ${MAX_SAVED_PHRASES} عبارة كحد أقصى.`);
        return;
      }

      savedPhrases.push({
        id: crypto.randomUUID?.() || `phrase-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text,
        useCount: 0,
        lastUsedAt: 0,
        createdAt: Date.now(),
      });
    }

    await savePhrases();
    resetPhraseEditor();
    renderPhrases();
    requestAnimationFrame(() => clampWidgetToViewport({ persist: hasCustomPosition }));
  }

  function startPhraseEdit(id) {
    const phrase = savedPhrases.find((item) => item.id === id);
    if (!phrase) return;

    editingPhraseId = id;
    phraseInput.value = phrase.text;
    phraseSaveButton.textContent = "✓";
    phraseSaveButton.title = "Save changes";
    phraseCancelEditButton.hidden = false;
    setPhraseError();
    phraseInput.focus();
    phraseInput.select();
  }

  async function deletePhrase(id) {
    savedPhrases = savedPhrases.filter((item) => item.id !== id);
    if (editingPhraseId === id) resetPhraseEditor();
    await savePhrases();
    renderPhrases();
    requestAnimationFrame(() => clampWidgetToViewport({ persist: hasCustomPosition }));
  }

  async function usePhrase(id) {
    const phrase = savedPhrases.find((item) => item.id === id);
    if (!phrase) return;

    if (!target || !isEditable(target) || widget.contains(target)) {
      status.textContent = "Clique d’abord dans un champ texte.";
      return;
    }

    try {
      insertText(target, phrase.text);
      phrase.useCount += 1;
      phrase.lastUsedAt = Date.now();
      await savePhrases();
      renderPhrases();
      status.textContent = "Phrase insérée ✓";
      setTimeout(() => {
        if (status.textContent === "Phrase insérée ✓") status.textContent = "";
      }, 1800);
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Impossible d’insérer la phrase.";
    }
  }

  phraseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void addOrUpdatePhrase();
  });

  phraseCancelEditButton.addEventListener("click", () => {
    resetPhraseEditor();
  });

  phraseInput.addEventListener("input", () => {
    if (phraseError.textContent) setPhraseError();
  });

  phraseList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-phrase-action]");
    if (!button) return;

    const { phraseAction, phraseId } = button.dataset;
    if (phraseAction === "use") {
      void usePhrase(phraseId);
    } else if (phraseAction === "edit") {
      startPhraseEdit(phraseId);
    } else if (phraseAction === "delete") {
      void deletePhrase(phraseId);
    }
  });

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

    renderPhrases();

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
      "savedArabicPhrases",
    ])
    .then((stored) => {
      if (stored.provider) providerSelect.value = stored.provider;
      if (stored.language) languageSelect.value = stored.language;
      if (stored.outputLanguage) outputLanguageSelect.value = stored.outputLanguage;
      translationProviderSelect.value = stored.translationProvider || "groq";

      savedPhrases = Array.isArray(stored.savedArabicPhrases)
        ? stored.savedArabicPhrases
            .map(normalizeStoredPhrase)
            .filter(Boolean)
            .slice(0, MAX_SAVED_PHRASES)
        : [];

      applyDisplayMode(stored.widgetDisplayMode || "medium", { persist: false });
      applyPosition(stored.widgetPosition);
      updateTranslationProviderVisibility();
      renderPhrases();
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
      if (!widget.contains(event.target) && isEditable(event.target)) {
        target = event.target;
        status.textContent = "";
        requestAnimationFrame(() => clampWidgetToViewport());
      }
    },
    true,
  );

  if (!widget.contains(document.activeElement) && isEditable(document.activeElement)) {
    target = document.activeElement;
  }

  requestAnimationFrame(() => clampWidgetToViewport());

  function setBusy(busy) {
    providerSelect.disabled = busy;
    languageSelect.disabled = busy;
    outputLanguageSelect.disabled = busy;
    translationProviderSelect.disabled = busy;
    recordButton.disabled = busy;
    phraseInput.disabled = busy;
    phraseSaveButton.disabled = busy;
    phraseCancelEditButton.disabled = busy;

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

  function resetRecordingUi() {
    recordButton.classList.remove("stt-recording");
    recordButton.textContent = "🎤";
    recordButton.title = "Start dictation";
    recordButton.setAttribute("aria-label", "Start dictation");
    cancelRecordingButton.hidden = true;
  }

  function cancelRecording() {
    if (recorder?.state !== "recording") return;

    recordingCancelled = true;
    clearTimeout(stopTimer);
    status.textContent = "Enregistrement annulé.";
    recorder.stop();
  }

  async function startRecording() {
    if (!target || widget.contains(target)) {
      status.textContent = "Clique d’abord dans un champ texte.";
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recordingCancelled = false;

      const mimeType = chooseMimeType();
      recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      recorder.addEventListener("dataavailable", (event) => {
        if (!recordingCancelled && event.data?.size) chunks.push(event.data);
      });

      recorder.addEventListener(
        "stop",
        async () => {
          clearTimeout(stopTimer);
          const durationMs = Math.max(1, Date.now() - startedAt);
          const cancelled = recordingCancelled;
          const blob = cancelled
            ? null
            : new Blob(chunks, {
                type: recorder.mimeType || mimeType || "audio/webm",
              });

          resetRecordingUi();
          stopTracks();
          chunks = [];

          if (cancelled) {
            recordingCancelled = false;
            setTimeout(() => {
              if (status.textContent === "Enregistrement annulé.") {
                status.textContent = "";
              }
            }, 1800);
            return;
          }

          if (blob?.size > 0) {
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
      cancelRecordingButton.hidden = false;
      status.textContent = "Recording…";

      stopTimer = setTimeout(() => {
        if (recorder?.state === "recording") recorder.stop();
      }, MAX_RECORDING_MS);
    } catch (error) {
      resetRecordingUi();
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

  cancelRecordingButton.addEventListener("click", cancelRecording);
})();
