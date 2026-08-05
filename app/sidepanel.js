
// Handles auth, composing a clip from a captured selection,
// publishing to Supabase, and rendering the feed / profile.

const cfg = window.MARGINAL_CONFIG || {};
console.log("Marginal config", {
  supabaseUrl: !!cfg.SUPABASE_URL,
  anonKey: !!cfg.SUPABASE_ANON_KEY,
  aiProxyUrl: !!cfg.AI_PROXY_URL,
  webappUrl: !!cfg.WEBAPP_URL
});
const supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const webappUrl = (cfg.WEBAPP_URL || "").replace(/\/$/, "");
const openMainAppLink = document.getElementById("open-main-app");
if (openMainAppLink) {
  if (webappUrl) {
    openMainAppLink.href = webappUrl;
    openMainAppLink.classList.remove("hidden");
  } else {
    openMainAppLink.classList.add("hidden");
  }
}

let currentUser = null;
let currentProfile = null;
let pendingClip = null;
let isSignupMode = false;
let feedScope = "all";

const $ = (id) => document.getElementById(id);

function slugify() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

// ---------- View / tab switching ----------
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $("view-" + name).classList.remove("hidden");
}

function setActiveTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
}

function goTo(name) {
  if (!currentUser && name !== "compose") {
    // still allow browsing feed without login
  }
  setActiveTab(name);
  if (name === "compose") {
    renderCompose();
  } else if (name === "feed") {
    showView("feed");
    loadFeed();
  } else if (name === "me") {
    if (!currentUser) {
      showView("auth");
    } else {
      showView("me");
      loadMe();
    }
  }
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => goTo(btn.dataset.tab));
});

// ---------- Auth ----------
$("btn-signup").addEventListener("click", () => {
  isSignupMode = !isSignupMode;
  $("signup-username-field").classList.toggle("hidden", !isSignupMode);
  $("btn-login").textContent = isSignupMode ? "Create account" : "Log in";
  $("btn-signup").textContent = isSignupMode ? "Back to log in" : "Sign up instead";
});

$("btn-login").addEventListener("click", async () => {
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  $("auth-error").classList.add("hidden");

  try {
    if (isSignupMode) {
      const username = $("auth-username").value.trim();
      if (!username) throw new Error("Pick a username.");
      const { error } = await supabaseClient.auth.signUp({
        email, password, options: { data: { username } }
      });
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    await refreshSession();
    goTo("compose");
  } catch (e) {
    $("auth-error").textContent = e.message || "Something went wrong.";
    $("auth-error").classList.remove("hidden");
  }
});

$("btn-logout").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  goTo("feed");
});

async function refreshSession() {
  const { data } = await supabaseClient.auth.getUser();
  currentUser = data?.user || null;
  if (currentUser) {
    const { data: profile } = await supabaseClient
      .from("profiles").select("*").eq("id", currentUser.id).single();
    currentProfile = profile;
  }
}

function getExtensionRuntime() {
  if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
    return chrome.runtime;
  }
  if (typeof browser !== "undefined" && browser.runtime && typeof browser.runtime.sendMessage === "function") {
    return browser.runtime;
  }
  return null;
}

function sendPanelMessage(message, callback) {
  const runtime = getExtensionRuntime();
  if (!runtime) {
    console.warn("Marginal: panel runtime unavailable", message);
    if (typeof callback === "function") callback(null);
    return;
  }
  try {
    runtime.sendMessage(message, callback);
  } catch (err) {
    console.warn("Marginal: panel messaging failed", err, message);
    if (typeof callback === "function") callback(null);
  }
}

// ---------- Compose ----------
async function loadPendingClip() {
  return new Promise((resolve) => {
    sendPanelMessage({ type: "MARGINAL_GET_PENDING_CLIP" }, (res) => {
      resolve(res?.payload || null);
    });
  });
}

async function renderCompose() {
  if (!currentUser) {
    showView("auth");
    return;
  }
  pendingClip = await loadPendingClip();
  showView("compose");
  $("compose-error").classList.add("hidden");
  $("compose-success").classList.add("hidden");

  if (!pendingClip) {
    $("compose-empty").classList.remove("hidden");
    $("compose-form").classList.add("hidden");
    return;
  }
  $("compose-empty").classList.add("hidden");
  $("compose-form").classList.remove("hidden");
  $("compose-quote").textContent = pendingClip.quotedText;
  $("compose-source-domain").textContent = pendingClip.sourceDomain;
  $("compose-source-link").href = pendingClip.sourceUrl;
  $("compose-commentary").value = "";
}

$("btn-discard").addEventListener("click", () => {
  sendPanelMessage({ type: "MARGINAL_CLEAR_PENDING_CLIP" });
  pendingClip = null;
  renderCompose();
});

$("btn-publish").addEventListener("click", async () => {
  if (!pendingClip || !currentUser) return;
  const commentary = $("compose-commentary").value.trim();
  $("compose-error").classList.add("hidden");

  try {
    const { error } = await supabaseClient.from("clips").insert({
      slug: slugify(),
      user_id: currentUser.id,
      source_url: pendingClip.sourceUrl,
      source_title: pendingClip.sourceTitle,
      source_domain: pendingClip.sourceDomain,
      quoted_text: pendingClip.quotedText,
      commentary
    });
    if (error) throw error;

    sendPanelMessage({ type: "MARGINAL_CLEAR_PENDING_CLIP" });
    pendingClip = null;
    $("compose-success").textContent = "Published! Check the Feed tab.";
    $("compose-success").classList.remove("hidden");
    $("compose-form").classList.add("hidden");
    setTimeout(() => renderCompose(), 1200);
  } catch (e) {
    $("compose-error").textContent = e.message || "Failed to publish.";
    $("compose-error").classList.remove("hidden");
  }
});

// ---------- Feed ----------
const feedSearchInput = $("feed-search");
const feedSearchButton = $("feed-search-btn");
const meSearchInput = $("me-search");
const meSearchButton = $("me-search-btn");

document.querySelectorAll(".chip-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    feedScope = btn.dataset.scope;
    loadFeed();
  });
});

feedSearchButton.addEventListener("click", () => {
  loadFeed(feedSearchInput.value.trim());
});

meSearchButton.addEventListener("click", () => {
  loadMe(meSearchInput.value.trim());
});

function clipCardHtml(c, showDelete = false) {
  const link = `${webappUrl}/clip.html?slug=${encodeURIComponent(c.slug)}`;
  const claimBadge = c.claim_status === "filed"
    ? '<span class="claim-badge">Claim filed</span>' : "";
  return `
    <div class="clip-card" data-clip-id="${escapeHtml(c.id)}">
      <div class="author-row">
        <span class="avatar">${initials(c.author_display_name || c.author_username)}</span>
        ${escapeHtml(c.author_display_name || c.author_username)}
      </div>
      <blockquote>"${escapeHtml(c.quoted_text)}"</blockquote>
      ${c.commentary ? `<div class="commentary">${escapeHtml(c.commentary)}</div>` : ""}
      <div class="card-actions">
        <button class="btn ghost summary-btn" type="button">Summarize note</button>
        ${showDelete ? '<button class="btn ghost delete-btn" type="button">Delete note</button>' : ''}
      </div>
      <div class="summary-block hidden">
        <strong>Summary</strong>
        <p class="summary-text"></p>
      </div>
      <div class="meta-row">
        <span>${escapeHtml(c.source_domain || "")} ${claimBadge}</span>
      </div>
    </div>`;
}

function buildSearchFilter(searchTerm, query) {
  if (!searchTerm) return query;
  const term = `%${searchTerm.replace(/%/g, "\\%")}%`;
  return query.or(
    `quoted_text.ilike.${term},commentary.ilike.${term}`
  );
}

async function loadFeed(searchTerm = "") {
  $("feed-list").innerHTML = '<p class="muted">Loading…</p>';
  try {
    let query = supabaseClient.from("clips_feed").select("*").limit(30);

    if (searchTerm) {
      query = buildSearchFilter(searchTerm, query);
    }

    if (feedScope === "following" && currentUser) {
      const { data: follows } = await supabaseClient
        .from("follows").select("following_id").eq("follower_id", currentUser.id);
      const ids = (follows || []).map((f) => f.following_id);
      if (ids.length === 0) {
        $("feed-list").innerHTML = '<p class="muted">You\'re not following anyone yet.</p>';
        return;
      }
      query = query.in("author_id", ids);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      $("feed-list").innerHTML = '<p class="muted">No clips match your search.</p>';
      return;
    }
    $("feed-list").innerHTML = data
      .map((clip) => clipCardHtml(clip, currentUser && clip.author_id === currentUser.id))
      .join("");
    attachSummaryButtons();
  } catch (e) {
    $("feed-list").innerHTML = `<p class="error">${escapeHtml(e.message || "Failed to load feed.")}</p>`;
  }
}

// ---------- Me ----------
async function loadMe(searchTerm = "") {
  if (!currentProfile) await refreshSession();
  $("me-profile").innerHTML = `
    <div class="profile-card">
      <div class="name">${escapeHtml(currentProfile?.display_name || currentProfile?.username || "")}</div>
      <div class="username">@${escapeHtml(currentProfile?.username || "")}</div>
    </div>`;
  $("me-clips").innerHTML = '<p class="muted">Loading…</p>';
  let query = supabaseClient
    .from("clips_feed").select("*").eq("author_id", currentUser.id).limit(50);

  if (searchTerm) {
    query = buildSearchFilter(searchTerm, query);
  }

  const { data, error } = await query;
  if (error) {
    $("me-clips").innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    return;
  }
  $("me-clips").innerHTML = data.length
    ? data.map((clip) => clipCardHtml(clip, true)).join("")
    : '<p class="muted">You haven\'t published a clip yet.</p>';
  attachSummaryButtons();
}

// ---------- React to new clips captured while panel is open ----------
const panelRuntime = getExtensionRuntime();
if (panelRuntime && panelRuntime.onMessage && typeof panelRuntime.onMessage.addListener === "function") {
  panelRuntime.onMessage.addListener((message) => {
    if (message.type === "MARGINAL_PENDING_CLIP_UPDATED") {
      pendingClip = message.payload;
      goTo("compose");
    }
  });
}

function attachSummaryButtons() {
  document.querySelectorAll(".summary-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const clipCard = event.target.closest(".clip-card");
      if (!clipCard) return;
      const summaryBlock = clipCard.querySelector(".summary-block");
      const summaryText = clipCard.querySelector(".summary-text");
      const quote = clipCard.querySelector("blockquote").textContent || "";
      const commentary = clipCard.querySelector(".commentary")?.textContent || "";
      const noteText = `${quote}\n\n${commentary}`.trim();

      summaryBlock.classList.remove("hidden");
      if (!noteText) {
        summaryText.textContent = "No text available to summarize.";
        return;
      }
      summaryText.textContent = "Summarizing...";

      const prompt = `Summarize this note in one short paragraph and explain its meaning clearly:\n\n${noteText}`;
      try {
        const result = await fetchSummarization(prompt, noteText);
        if (result.html) {
          summaryText.innerHTML = result.text;
        } else {
          summaryText.textContent = result.text;
        }
      } catch (err) {
        console.error("Marginal: summarization failed", err);
        summaryText.innerHTML = buildSearchFallbackHtml(noteText);
      }
    });
  });

  document.querySelectorAll(".delete-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const clipCard = event.target.closest(".clip-card");
      if (!clipCard) return;
      const clipId = clipCard.dataset.clipId;
      if (!clipId) return;

      if (!confirm("Delete this note for everyone? This cannot be undone.")) {
        return;
      }

      try {
        const { error } = await supabaseClient
          .from("clips")
          .delete()
          .eq("id", clipId)
          .eq("user_id", currentUser.id);

        if (error) throw error;
        clipCard.remove();
      } catch (err) {
        alert(err?.message || "Failed to delete note.");
      }
    });
  });
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}

const SUMMARIZER_STOPWORDS = new Set([
  "the", "and", "a", "an", "in", "on", "for", "of", "to", "is", "it",
  "that", "this", "with", "as", "at", "by", "from", "or", "are", "was",
  "be", "been", "were", "but", "if", "so", "can", "may", "will", "has",
  "have", "had", "which", "their", "they", "its", "also"
]);

function scoreSentences(text) {
  const normalized = normalizeText(text).toLowerCase();
  const words = normalized.match(/\b[a-z0-9']+\b/g) || [];
  const frequencies = {};
  for (const word of words) {
    if (SUMMARIZER_STOPWORDS.has(word)) continue;
    frequencies[word] = (frequencies[word] || 0) + 1;
  }

  return splitSentences(text).map((sentence) => {
    const sentenceWords = sentence.toLowerCase().match(/\b[a-z0-9']+\b/g) || [];
    let score = 0;
    for (const word of sentenceWords) {
      if (frequencies[word]) score += frequencies[word];
    }
    return { sentence: sentence.trim(), score };
  });
}

function simplifySingleSentenceSummary(text) {
  const lowered = text.toLowerCase();
  if (lowered.includes("can refer to")) {
    return text.replace(/can refer to/gi, "can mean").replace(/,?\s*or it can be an?/gi, ", or");
  }
  if (lowered.includes("can mean")) {
    return text;
  }
  if (lowered.includes(" or ") && text.split(" or ").length <= 3) {
    return text.replace(/\s+or\s+/gi, " or ");
  }
  if (text.length > 120) {
    const cutoff = text.indexOf(",", Math.min(80, text.length - 1));
    return cutoff > 0 ? text.slice(0, cutoff) + "..." : text;
  }
  return text;
}

function truncateText(text, maxLength = 120) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength).replace(/\s+\S*$/, "");
  return truncated + "...";
}

function localSummarize(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { text: "No summary available.", html: false };
  }

  const parts = normalized.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const quote = parts[0] || "";
  const commentary = parts.slice(1).join(" ").trim();

  const scoreText = (input) => {
    const sentences = splitSentences(input).map((s) => s.trim()).filter(Boolean);
    if (sentences.length === 0) return "";
    if (sentences.length === 1) return simplifySingleSentenceSummary(sentences[0]);

    const scored = scoreSentences(input)
      .filter((item) => item.sentence.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((item) => item.sentence);

    return scored.join(" ");
  };

  if (commentary) {
    const summary = scoreText(commentary) || truncateText(commentary, 120);
    if (quote) {
      return {
        text: `This note explains the highlight: ${truncateText(summary, 120)}`,
        html: false
      };
    }
    return { text: `Summary: ${truncateText(summary, 120)}`, html: false };
  }

  const quoteSummary = scoreText(quote || normalized) || truncateText(normalized, 120);
  return { text: `Highlight: ${truncateText(quoteSummary, 120)}`, html: false };
}

function buildSearchFallbackHtml(noteText) {
  const query = noteText
    ? noteText
        .trim()
        .replace(/\s+/g, " ")
        .split(" ")
        .slice(0, 18)
        .join(" ")
    : "find this note";
  const searchUrl = "https://www.google.com/search?q=" + encodeURIComponent(query);
  return `AI summarization failed. <a href="${searchUrl}" target="_blank" rel="noopener">Search for it on Google</a>`;
}

async function callGoogleSummarization(prompt) {
  return localSummarize(prompt).text;
}

function parseSearchResults(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const results = [];
  const anchors = [...doc.querySelectorAll("a[href^='http']")];
  for (const anchor of anchors) {
    const href = anchor.href || anchor.getAttribute("href");
    if (!href || !href.startsWith("http")) continue;
    const text = anchor.textContent.trim();
    if (!text || text.toLowerCase().includes("duckduckgo") || text.toLowerCase().includes("search")) continue;
    results.push({ url: href, snippet: text });
    if (results.length >= 3) break;
  }
  return results;
}

async function fetchPageText(url, charLimit = 4000) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const texts = [...doc.querySelectorAll("p, h1, h2, h3, li")]
      .map((node) => node.textContent.trim())
      .filter(Boolean);
    const combined = texts.join(" ").replace(/\s+/g, " ").trim();
    return combined.slice(0, charLimit);
  } catch (err) {
    return null;
  }
}

async function searchAndSummarize(query) {
  const searchUrl = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;
  let searchHtml;
  try {
    const response = await fetch(searchUrl);
    if (!response.ok) throw new Error("Search request failed.");
    searchHtml = await response.text();
  } catch (err) {
    return localSummarize(query);
  }

  const results = parseSearchResults(searchHtml);
  if (!results.length) {
    return localSummarize(query);
  }

  const pageText = await fetchPageText(results[0].url) || results[0].snippet;
  if (!pageText) {
    return localSummarize(query);
  }

  const searchPrompt = `Use the following search result content to answer the query and summarize the main point in one short paragraph:\n\nSearch query: ${query}\n\nResult URL: ${results[0].url}\n\nContent:\n${pageText}`;
  try {
    const summary = await callGoogleSummarization(searchPrompt);
    return { text: summary, html: false };
  } catch (err) {
    return localSummarize(query);
  }
}

async function fetchSummarization(prompt, noteText) {
  const query = noteText || prompt;
  const proxyUrl = cfg.AI_PROXY_URL ? cfg.AI_PROXY_URL.replace(/\/$/, "") : null;

  if (proxyUrl) {
    try {
      const response = await fetch(`${proxyUrl}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, noteText: query })
      });
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data.summary === "string" && data.summary.trim()) {
          return { text: data.summary.trim(), html: false };
        }
      } else {
        console.warn("Marginal: AI proxy responded with error", response.status, await response.text());
      }
    } catch (err) {
      console.warn("Marginal: AI proxy request failed", err);
    }
  }

  return localSummarize(query);
}

// ---------- Boot ----------
(async function init() {
  await refreshSession();
  const initialPending = await loadPendingClip();
  if (initialPending) {
    goTo("compose");
  } else if (currentUser) {
    goTo("feed");
  } else {
    goTo("feed"); // feed is publicly viewable even signed out
  }
})();
