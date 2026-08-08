// ============================================================
// FILL THESE IN after you create your Supabase project.
// Project Settings (gear icon) > API > Project URL / anon public key.
// The anon key is safe to ship in a client — Row Level Security
// policies (see supabase/schema.sql) control what it can actually do.
// ============================================================
window.CLIPPER_CONFIG = {
  SUPABASE_URL: "https://lgdbyynrarikfnyjunaw.supabase.com",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnZGJ5eW5yYXJpa2ZueWp1bmF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NTE1MDksImV4cCI6MjEwMTQyNzUwOX0.C_RziaBzdBXPROEtBtzWlq6rSED8-8mjdRid0dANadQ",
  // Where your public webapp (feed.html / clip.html) is deployed.
  // e.g. "https://clipper-app.netlify.app" — no trailing slash.
  WEBAPP_URL: "https://YOUR-DEPLOYED-WEBAPP-URL",
  // Optional: point to your backend proxy that holds the OpenAI key.
  AI_PROXY_URL: "http://localhost:3000"
};
