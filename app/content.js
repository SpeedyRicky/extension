"use strict";

(() => {
  const BUTTON_ID = "clipper-clip-btn";
  const TOAST_ID = "clipper-toast";

  let clipButton = null;
  let lastSelectedText = "";
  let toastTimer = null;

  function getRuntime() {
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        return chrome.runtime;
      }
    } catch {
      return null;
    }

    return null;
  }

  function sendMessage(message, callback) {
    const runtime = getRuntime();

    if (!runtime) {
      callback?.(null);
      return;
    }

    try {
      runtime.sendMessage(message, (response) => {
        try {
          void chrome.runtime.lastError;
        } catch {}

        callback?.(response ?? null);
      });
    } catch {
      callback?.(null);
    }
  }

  function removeButton() {
    if (!clipButton) {
      return;
    }

    try {
      clipButton.remove();
    } catch {}

    clipButton = null;
  }

  function showToast(message) {
    const existing = document.getElementById(TOAST_ID);

    if (existing) {
      existing.remove();
    }

    const toast = document.createElement("div");

    toast.id = TOAST_ID;
    toast.textContent = message;

    document.documentElement.appendChild(toast);

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      try {
        toast.remove();
      } catch {}
    }, 2800);
  }

  function getSelectionText() {
    try {
      const selection = window.getSelection();

      if (!selection) {
        return "";
      }

      return selection.toString().trim();
    } catch {
      return "";
    }
  }

  function buildClip() {
    const text = lastSelectedText.trim();

    if (!text) {
      return null;
    }

    const url = window.location.href;

    try {
      new URL(url);
    } catch {
      return null;
    }

    return {
      quotedText: text.slice(0, 20000),
      sourceUrl: url,
      sourceTitle:
        document.title?.trim().slice(0, 500) ||
        window.location.hostname,
      sourceDomain: window.location.hostname
    };
  }

  function saveFallback(clip) {
    try {
      chrome.storage.local.set(
        {
          clipnoter_pending_clip: clip
        },
        () => {
          try {
            void chrome.runtime.lastError;
          } catch {}
        }
      );
    } catch {}
  }

  function clipSelection() {
    const clip = buildClip();

    if (!clip) {
      showToast("Select some text first.");
      return;
    }

    saveFallback(clip);

    sendMessage(
      {
        type: "CLIPNOTER_NEW_CLIP",
        payload: clip
      },
      (response) => {
        if (response?.ok) {
          showToast("Clip saved — opening ClipNoter…");
        } else {
          showToast(
            "Clip saved. Open ClipNoter from the toolbar."
          );
        }
      }
    );

    sendMessage({
      type: "CLIPNOTER_OPEN_PANEL"
    });

    removeButton();

    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
  }

  function positionButton(rect) {
    if (!clipButton || !rect) {
      return;
    }

    const buttonWidth = 112;
    const buttonHeight = 40;
    const padding = 8;

    let left =
      rect.left +
      rect.width / 2 -
      buttonWidth / 2;

    let top =
      rect.top -
      buttonHeight -
      10;

    left = Math.max(
      padding,
      Math.min(
        left,
        window.innerWidth -
          buttonWidth -
          padding
      )
    );

    if (top < padding) {
      top = rect.bottom + 10;
    }

    top = Math.max(
      padding,
      Math.min(
        top,
        window.innerHeight -
          buttonHeight -
          padding
      )
    );

    clipButton.style.left = `${left}px`;
    clipButton.style.top = `${top}px`;
  }

  function createButton(rect) {
    removeButton();

    clipButton = document.createElement("button");

    clipButton.id = BUTTON_ID;
    clipButton.type = "button";

    clipButton.setAttribute(
      "aria-label",
      "Clip selected text with ClipNoter"
    );

    clipButton.innerHTML = `
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M16 3a3 3 0 0 1 3 3v5h-2V6a1 1 0 0 0-1-1h-3V3h3ZM8 21a3 3 0 0 1-3-3v-5h2v5a1 1 0 0 0 1 1h3v2H8Zm8-15H8a2 2 0 0 0-2 2v8h2V8h8v8h2V8a2 2 0 0 0-2-2Z"
        />
      </svg>

      <span>Clip this</span>
    `;

    clipButton.addEventListener(
      "mousedown",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    clipButton.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        clipSelection();
      }
    );

    document.documentElement.appendChild(
      clipButton
    );

    positionButton(rect);
  }

  function handleSelection() {
    setTimeout(() => {
      const text = getSelectionText();

      if (!text) {
        removeButton();
        return;
      }

      if (text.length < 2) {
        removeButton();
        return;
      }

      lastSelectedText = text;

      try {
        const selection = window.getSelection();

        if (
          !selection ||
          selection.rangeCount === 0
        ) {
          removeButton();
          return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (
          !rect ||
          (!rect.width && !rect.height)
        ) {
          removeButton();
          return;
        }

        createButton(rect);
      } catch {
        removeButton();
      }
    }, 20);
  }

  document.addEventListener(
    "mouseup",
    (event) => {
      if (
        clipButton &&
        (
          event.target === clipButton ||
          clipButton.contains(event.target)
        )
      ) {
        return;
      }

      handleSelection();
    },
    false
  );

  document.addEventListener(
    "mousedown",
    (event) => {
      if (
        clipButton &&
        (
          event.target === clipButton ||
          clipButton.contains(event.target)
        )
      ) {
        return;
      }

      removeButton();
    },
    false
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        removeButton();
      }
    },
    false
  );

  window.addEventListener(
    "scroll",
    removeButton,
    {
      passive: true
    }
  );

  window.addEventListener(
    "resize",
    removeButton,
    {
      passive: true
    }
  );

  let previousUrl = location.href;

  setInterval(() => {
    if (location.href !== previousUrl) {
      previousUrl = location.href;
      removeButton();
      lastSelectedText = "";
    }
  }, 1000);
})();