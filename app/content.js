// Marginal — content script
// Detects a text selection anywhere on the page, shows a floating
// "Clip this" button, and hands the selected passage + page context
// off to the side panel when clicked.

(function () {
  let btn = null;
  let lastSelectionText = "";

  function removeButton() {
    if (btn) {
      btn.remove();
      btn = null;
    }
  }

  function showToast(message) {
    const existing = document.getElementById("marginal-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "marginal-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function createButton(x, y) {
    if (!getExtensionRuntime()) {
      return;
    }
    removeButton();
    btn = document.createElement("button");
    btn.id = "marginal-clip-btn";
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4a2 2 0 00-2 2v1H3v2h2v6H3v2h2v1a2 2 0 002 2h2v-2H7v-1a2 2 0 00-1-1.73A2 2 0 008 12a2 2 0 001-1.27A2 2 0 007 9V8h2V6H7V4h2V2H7z"/></svg>' +
      "Clip this";
    btn.style.left = x + "px";
    btn.style.top = y + "px";
    btn.addEventListener("mousedown", (e) => {
      // prevent the mousedown from collapsing the selection before click fires
      e.preventDefault();
    });
    btn.addEventListener("click", handleClipClick);
    document.body.appendChild(btn);
  }

  function getExtensionRuntime() {
    if (typeof chrome !== "undefined") {
      try {
        const chromeRuntime = chrome && chrome.runtime;
        if (chromeRuntime && typeof chromeRuntime.sendMessage === "function") {
          return chromeRuntime;
        }
      } catch (err) {
        console.warn("Marginal: chrome runtime check failed", err);
      }
    }

    if (typeof browser !== "undefined") {
      try {
        const browserRuntime = browser && browser.runtime;
        if (browserRuntime && typeof browserRuntime.sendMessage === "function") {
          return browserRuntime;
        }
      } catch (err) {
        console.warn("Marginal: browser runtime check failed", err);
      }
    }

    return null;
  }

  function sendExtensionMessage(message, callback) {
    const runtime = getExtensionRuntime();
    if (!runtime) {
      console.warn("Marginal: extension runtime unavailable", {
        chrome: typeof chrome !== "undefined" ? chrome : undefined,
        browser: typeof browser !== "undefined" ? browser : undefined
      });
      showToast("Extension runtime unavailable. Please reload Marginal.");
      return;
    }

    const send = runtime.sendMessage;
    if (typeof send !== "function") {
      console.warn("Marginal: runtime.sendMessage is not a function", {
        runtimeType: typeof runtime,
        runtimeKeys: Object.keys(runtime || {}).slice(0, 20)
      });
      showToast("Extension messaging unavailable.");
      return;
    }

    try {
      send.call(runtime, message, callback);
    } catch (err) {
      console.warn("Marginal: extension messaging error", err, { message });
      showToast("Extension messaging failed.");
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

    sendExtensionMessage(
      { type: "MARGINAL_NEW_CLIP", payload },
      () => {
        showToast("Clip captured — opening Marginal…");
      }
    );

    // best-effort: also open the side panel directly if the API allows it
    sendExtensionMessage({ type: "MARGINAL_OPEN_PANEL" });

    removeButton();
    window.getSelection()?.removeAllRanges();
  }

  document.addEventListener("mouseup", (e) => {
    // ignore clicks on our own button
    if (e.target && e.target.id === "marginal-clip-btn") return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection ? selection.toString() : "";
      if (text && text.trim().length > 0) {
        lastSelectionText = text;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const x = Math.min(
          window.scrollX + rect.left + rect.width / 2 - 50,
          window.scrollX + document.documentElement.clientWidth - 130
        );
        const y = window.scrollY + rect.top - 44;
        createButton(Math.max(8, x), Math.max(8, y));
      } else {
        removeButton();
      }
    }, 5);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target && e.target.id === "marginal-clip-btn") return;
    removeButton();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removeButton();
  });
})();
