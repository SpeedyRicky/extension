// Marginal — background service worker
// Relays captured clips from the content script to the side panel,
// and opens the side panel on toolbar-icon click or on a fresh clip.

let pendingClip = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "MARGINAL_NEW_CLIP") {
    pendingClip = message.payload;
    chrome.storage.local.set({ marginal_pending_clip: message.payload });
    // notify any open side panel instance immediately
    try {
      const maybePromise = chrome.runtime.sendMessage({ type: "MARGINAL_PENDING_CLIP_UPDATED", payload: message.payload });
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {});
      }
    } catch (err) {
      console.warn("Marginal: failed to broadcast pending clip update", err);
    }
    sendResponse({ ok: true });
  }

  if (message.type === "MARGINAL_OPEN_PANEL" && sender.tab && sender.tab.windowId != null) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
  }

  if (message.type === "MARGINAL_GET_PENDING_CLIP") {
    chrome.storage.local.get(["marginal_pending_clip"], (result) => {
      sendResponse({ payload: result.marginal_pending_clip || null });
    });
    return true; // async response
  }

  if (message.type === "MARGINAL_CLEAR_PENDING_CLIP") {
    chrome.storage.local.remove("marginal_pending_clip");
    pendingClip = null;
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId != null) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
});

// Allow the toolbar icon to open the panel on any site by default.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
