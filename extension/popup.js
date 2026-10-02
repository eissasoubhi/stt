const currentSiteHost = document.querySelector("#current-site-host");
const currentSiteState = document.querySelector("#current-site-state");
const currentSiteToggle = document.querySelector("#current-site-toggle");
const currentSiteHelp = document.querySelector("#current-site-help");
const allowedSitesList = document.querySelector("#allowed-sites-list");
const allowedSitesCount = document.querySelector("#allowed-sites-count");
const emptySites = document.querySelector("#empty-sites");
const popupStatus = document.querySelector("#popup-status");

let currentTab = null;
let currentPattern = null;
let allowedSitePatterns = [];

function setStatus(message = "", { error = false } = {}) {
  popupStatus.textContent = message;
  popupStatus.classList.toggle("error", error);
}

function patternFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return null;
  }
}

function patternDetails(pattern) {
  const match = /^(https?):\/\/([^/]+)\/\*$/.exec(pattern);
  if (!match) {
    return {
      scheme: "",
      host: pattern,
    };
  }

  return {
    scheme: match[1],
    host: match[2],
  };
}

async function savePatterns(patterns) {
  allowedSitePatterns = [...new Set(patterns)].sort();
  await chrome.storage.local.set({ allowedSitePatterns });

  const result = await chrome.runtime.sendMessage({
    type: "SYNC_ALLOWED_SITES",
  });

  if (!result?.ok) {
    throw new Error(result?.error || "Impossible de synchroniser les sites.");
  }
}

async function reloadCurrentTabIfNeeded(pattern) {
  if (!currentTab?.id || currentPattern !== pattern) return;

  try {
    await chrome.tabs.reload(currentTab.id);
  } catch {
    // Some browser-internal pages cannot be reloaded by the extension.
  }
}

function renderAllowedSites() {
  allowedSitesList.replaceChildren();
  allowedSitesCount.textContent = String(allowedSitePatterns.length);
  emptySites.hidden = allowedSitePatterns.length > 0;

  for (const pattern of allowedSitePatterns) {
    const { host, scheme } = patternDetails(pattern);

    const row = document.createElement("div");
    row.className = "site-row";

    const details = document.createElement("div");
    details.className = "site-details";

    const hostElement = document.createElement("span");
    hostElement.className = "site-host";
    hostElement.textContent = host;

    const schemeElement = document.createElement("span");
    schemeElement.className = "site-scheme";
    schemeElement.textContent = scheme.toUpperCase();

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-site";
    removeButton.title = `Retirer ${host}`;
    removeButton.setAttribute("aria-label", `Retirer ${host}`);
    removeButton.textContent = "✕";

    removeButton.addEventListener("click", async () => {
      removeButton.disabled = true;
      setStatus("Suppression du site…");

      try {
        const nextPatterns = allowedSitePatterns.filter(
          (item) => item !== pattern,
        );

        await savePatterns(nextPatterns);

        await chrome.permissions.remove({
          origins: [pattern],
        });

        renderAllowedSites();
        renderCurrentSite();
        setStatus(`${host} n’est plus autorisé.`);

        await reloadCurrentTabIfNeeded(pattern);
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Suppression impossible.",
          { error: true },
        );
      } finally {
        removeButton.disabled = false;
      }
    });

    details.append(hostElement, schemeElement);
    row.append(details, removeButton);
    allowedSitesList.appendChild(row);
  }
}

function renderCurrentSite() {
  if (!currentPattern) {
    currentSiteHost.textContent = "Page non compatible";
    currentSiteState.textContent = "";
    currentSiteToggle.textContent = "Indisponible sur cette page";
    currentSiteToggle.disabled = true;
    currentSiteToggle.classList.remove("remove");
    currentSiteHelp.textContent =
      "Ouvre un site HTTP/HTTPS puis clique de nouveau sur l’icône de l’extension.";
    return;
  }

  const { host } = patternDetails(currentPattern);
  const allowed = allowedSitePatterns.includes(currentPattern);

  currentSiteHost.textContent = host;
  currentSiteToggle.disabled = false;
  currentSiteToggle.classList.toggle("remove", allowed);

  if (allowed) {
    currentSiteState.textContent = "Autorisé";
    currentSiteState.className = "site-state allowed";
    currentSiteToggle.textContent = "Désactiver sur ce site";
    currentSiteHelp.textContent =
      "Le widget peut s’intégrer aux champs texte de ce site.";
  } else {
    currentSiteState.textContent = "Non autorisé";
    currentSiteState.className = "site-state blocked";
    currentSiteToggle.textContent = "Activer sur ce site";
    currentSiteHelp.textContent =
      "Aucun code de l’extension n’est injecté sur ce site tant que tu ne l’autorises pas.";
  }
}

currentSiteToggle.addEventListener("click", async () => {
  if (!currentPattern) return;

  currentSiteToggle.disabled = true;
  setStatus("");

  const { host } = patternDetails(currentPattern);
  const isAllowed = allowedSitePatterns.includes(currentPattern);

  try {
    if (isAllowed) {
      const nextPatterns = allowedSitePatterns.filter(
        (pattern) => pattern !== currentPattern,
      );

      await savePatterns(nextPatterns);

      await chrome.permissions.remove({
        origins: [currentPattern],
      });

      setStatus(`${host} n’est plus autorisé.`);
    } else {
      const granted = await chrome.permissions.request({
        origins: [currentPattern],
      });

      if (!granted) {
        setStatus("Autorisation refusée. Le site n’a pas été ajouté.", {
          error: true,
        });
        return;
      }

      await savePatterns([...allowedSitePatterns, currentPattern]);
      setStatus(`${host} est maintenant autorisé.`);
    }

    renderAllowedSites();
    renderCurrentSite();
    await reloadCurrentTabIfNeeded(currentPattern);
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Modification impossible.",
      { error: true },
    );
  } finally {
    currentSiteToggle.disabled = false;
  }
});

async function initialize() {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    currentTab = tabs[0] || null;
    currentPattern = patternFromUrl(currentTab?.url || "");

    const stored = await chrome.storage.local.get("allowedSitePatterns");
    allowedSitePatterns = Array.isArray(stored.allowedSitePatterns)
      ? stored.allowedSitePatterns
      : [];

    renderAllowedSites();
    renderCurrentSite();
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Chargement impossible.",
      { error: true },
    );
  }
}

void initialize();
