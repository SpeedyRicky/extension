"use strict";

const PENDING_CLIP_KEY = "clipnoter_pending_clip";

function storageGet(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([key], (result) => {
        void chrome.runtime.lastError;
        resolve(result?.[key] ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(values, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

function storageRemove(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.remove(key, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        void chrome.runtime.lastError;
        resolve(response ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

function validateClip(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  if (
    typeof payload.quotedText !== "string" ||
    !payload.quotedText.trim()
  ) {
    return false;
  }

  if (
    typeof payload.sourceUrl !== "string" ||
    !payload.sourceUrl.trim()
  ) {
    return false;
  }

  try {
    new URL(payload.sourceUrl);
  } catch {
    return false;
  }

  return true;
}

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return false;
    }

    if (message.type === "CLIPNOTER_NEW_CLIP") {
      const payload = message.payload;

      if (!validateClip(payload)) {
        sendResponse({
          ok: false,
          error: "Invalid clip."
        });

        return false;
      }

      void storageSet({
        [PENDING_CLIP_KEY]: payload
      }).then(() => {
        void sendRuntimeMessage({
          type: "CLIPNOTER_PENDING_CLIP_UPDATED",
          payload
        });
      });

      sendResponse({
        ok: true
      });

      return false;
    }

    if (message.type === "CLIPNOTER_GET_PENDING_CLIP") {
      storageGet(PENDING_CLIP_KEY).then((payload) => {
        sendResponse({
          ok: true,
          payload
        });
      });

      return true;
    }

    if (message.type === "CLIPNOTER_CLEAR_PENDING_CLIP") {
      storageRemove(PENDING_CLIP_KEY).then(() => {
        sendResponse({
          ok: true
        });
      });

      return true;
    }

    if (message.type === "CLIPNOTER_OPEN_PANEL") {
      const windowId = sender?.tab?.windowId;

      if (typeof windowId !== "number") {
        sendResponse({
          ok: false,
          error: "No browser window found."
        });

        return false;
      }

      chrome.sidePanel
        .open({
          windowId
        })
        .then(() => {
          sendResponse({
            ok: true
          });
        })
        .catch(() => {
          sendResponse({
            ok: false,
            error: "Unable to open the side panel."
          });
        });

      return true;
    }

    return false;
  }
);

chrome.action.onClicked.addListener((tab) => {
  const windowId = tab?.windowId;

  if (typeof windowId !== "number") {
    return;
  }

  chrome.sidePanel
    .open({
      windowId
    })
    .catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({
      openPanelOnActionClick: true
    })
    .catch(() => {});
});