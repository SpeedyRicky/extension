// Clipper — content script
// Detects a text selection anywhere on the page, shows a floating
// "Clip this" button, and hands the selected passage + page context
// off to the side panel when clicked.
(function () {
  const safeConsole = {
    log: typeof console !== "undefined" && typeof console.log === "function" ? console.log.bind(console) : () => {},
    warn: typeof console !== "undefined" && typeof console.warn === "function" ? console.warn.bind(console) : () => {},
    error: typeof console !== "undefined" && typeof console.error === "function" ? console.error.bind(console) : () => {}
  };

  let btn = null;
  let lastSelectionText = "";

  function removeButton() {
    if (btn) {
      btn.remove();
      btn = null;
    }
  }

  function showToast(message) {
    const existing = document.getElementById("clipper-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "clipper-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

function createButton(x, y) {
  removeButton();

  btn = document.createElement("button");
  btn.id = "clipper-clip-btn";

  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4a2 2 0 00-2 2v1H3v2h2v6H3v2h2v1a2 2 0 002 2h2v-2H7v-1a2 2 0 00-1-1.73A2 2 0 008 12a2 2 0 001-1.27A2 2 0 007 9V8h2V6H7V4h2V2H7z"/></svg>' +
    "Clip this";

  btn.style.left = x + "px";
  btn.style.top = y + "px";

  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });

  btn.addEventListener("click", handleClipClick);

  document.documentElement.appendChild(btn);
}

  function getExtensionRuntime() {
    if (typeof chrome !== "undefined") {
      try {
        const chromeRuntime = chrome && chrome.runtime;
        if (chromeRuntime && typeof chromeRuntime.sendMessage === "function") {
          return chromeRuntime;
        }
      } catch (err) {
        safeConsole.warn("Clipper: chrome runtime check failed", err);
      }
    }

    if (typeof browser !== "undefined") {
      try {
        const browserRuntime = browser && browser.runtime;
        if (browserRuntime && typeof browserRuntime.sendMessage === "function") {
          return browserRuntime;
        }
      } catch (err) {
        safeConsole.warn("Clipper: browser runtime check failed", err);
      }
    }

    return null;
  }

  function savePendingClipLocally(payload) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local && typeof chrome.storage.local.set === "function") {
      try {
        chrome.storage.local.set({ clipper_pending_clip: payload }, () => {});
      } catch (err) {
        safeConsole.warn("Clipper: failed to save pending clip locally", err);
      }
    }
  }

  function sendExtensionMessage(message, callback) {
    const runtime = getExtensionRuntime();
    if (!runtime) {
      safeConsole.warn("Clipper: extension runtime unavailable", {
        chrome: typeof chrome !== "undefined" ? chrome : undefined,
        browser: typeof browser !== "undefined" ? browser : undefined
      });
      showToast("Extension runtime unavailable. Please reload Clipper.");
      if (typeof callback === "function") callback(null);
      return;
    }

    if (typeof chrome !== "undefined" && runtime === chrome.runtime) {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.warn("Clipper: extension messaging error", chrome.runtime.lastError, message);
            if (typeof callback === "function") callback(null);
            return;
          }
          if (typeof callback === "function") callback(response);
        });
      } catch (err) {
        safeConsole.warn("Clipper: extension messaging failed", err, message);
        if (typeof callback === "function") callback(null);
      }
      return;
    }

    const send = runtime.sendMessage;
    if (typeof send !== "function") {
      console.warn("Clipper: runtime.sendMessage is not a function", {
        runtimeType: typeof runtime,
        runtimeKeys: Object.keys(runtime || {}).slice(0, 20)
      });
      showToast("Extension messaging unavailable.");
      if (typeof callback === "function") callback(null);
      return;
    }

    try {
      const maybePromise = send.call(runtime, message);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then((response) => {
          if (typeof callback === "function") callback(response);
        }).catch((err) => {
          console.warn("Clipper: extension messaging error", err, message);
          if (typeof callback === "function") callback(null);
        });
      } else {
        if (typeof callback === "function") callback(null);
      }
    } catch (err) {
      safeConsole.warn("Clipper: extension messaging error", err, { message });
      showToast("Extension messaging failed.");
      if (typeof callback === "function") callback(null);
    }
  }

  function handleClipClick() {
    const text = lastSelectionText.trim();
    if (!text) return;

    const payload = {
      quotedText: text,
      sourceUrl: location.href,
      sourceTitle: document.title,
      sourceDomain: location.hostname
    };

    savePendingClipLocally(payload);

    sendExtensionMessage(
      { type: "CLIPPER_NEW_CLIP", payload },
      () => {
        showToast("Clip captured — opening Clipper…");
      }
    );

    // best-effort: also open the side panel directly if the API allows it
    sendExtensionMessage({ type: "CLIPPER_OPEN_PANEL" });

    removeButton();
    window.getSelection()?.removeAllRanges();
  }

  document.addEventListener("mouseup", (e) => {
    // ignore clicks on our own button
    if (e.target && e.target.id === "clipper-clip-btn") return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection ? selection.toString() : "";
      if (text && text.trim().length > 0) {
        lastSelectionText = text;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const x = Math.min(
        rect.left + rect.width / 2 - 50,
        window.innerWidth - 130
    );

const y = Math.max(8, rect.top - 44);

createButton(Math.max(8, x), y);
      } else {
        removeButton();
      }
    }, 5);
  });

document.addEventListener("mousedown", (e) => {
  if (btn && (e.target === btn || btn.contains(e.target))) {
    return;
  }

  removeButton();
});

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removeButton();
  });
})();
