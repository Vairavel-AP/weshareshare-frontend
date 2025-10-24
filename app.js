/* app.js
  Cognito Authorization Code + PKCE flow (browser SPA)
  - Uses your Hosted UI domain and App Client ID (already set below)
  - Callback URL: https://vairavel-ap.github.io/weshareshare-frontend/home.html
  - Sign-out redirect: https://vairavel-ap.github.io/weshareshare-frontend/index.html
  - Stores id_token & access_token in localStorage keys:
      cognito_id_token_v1, cognito_access_token_v1, cognito_refresh_token_v1 (if returned)
  - On page load handles ?code=... (token exchange) and updates UI with profile info.
*/

/* === Configuration (values you provided) === */
const COGNITO_DOMAIN = "https://ap-south-1vmdpl6mvh.auth.ap-south-1.amazoncognito.com";
const COGNITO_CLIENT_ID = "6tmjg5udk8sgqrbj1lh5s1e8av";

const CALLBACK_URL = "https://vairavel-ap.github.io/weshareshare-frontend/home.html";
const SIGNOUT_URL = "https://vairavel-ap.github.io/weshareshare-frontend/index.html";

const AUTH_ENDPOINT = `${COGNITO_DOMAIN}/oauth2/authorize`; // for PKCE redirect
const TOKEN_ENDPOINT = `${COGNITO_DOMAIN}/oauth2/token`;
const LOGOUT_ENDPOINT = `${COGNITO_DOMAIN}/logout`;

/* Storage keys */
const PKCE_VERIFIER_KEY = "pkce_verifier_v1";
const ID_TOKEN_KEY = "cognito_id_token_v1";
const ACCESS_TOKEN_KEY = "cognito_access_token_v1";
const REFRESH_TOKEN_KEY = "cognito_refresh_token_v1";

/* ---------- Utility: base64url encode ---------- */
function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ---------- Generate PKCE codes ---------- */
async function generatePKCECodes() {
  const rand = new Uint8Array(64);
  crypto.getRandomValues(rand);
  const verifier = base64UrlEncode(rand);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const challenge = base64UrlEncode(digest);
  return { verifier, challenge };
}

/* ---------- Start sign-in (redirect to Cognito) ---------- */
async function signIn() {
  try {
    const { verifier, challenge } = await generatePKCECodes();
    localStorage.setItem(PKCE_VERIFIER_KEY, verifier);

    const state = Math.random().toString(36).slice(2);
    const scope = encodeURIComponent("openid profile email");
    // response_type=code for Authorization Code flow (PKCE)
    const url =
      `${AUTH_ENDPOINT}` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(COGNITO_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` +
      `&state=${state}` +
      `&scope=${scope}` +
      `&code_challenge_method=S256` +
      `&code_challenge=${encodeURIComponent(challenge)}`;

    window.location.href = url;
  } catch (err) {
    console.error("signIn error", err);
    alert("Failed to start sign-in: " + err.message);
  }
}

/* ---------- Handle redirect (if ?code= present) ---------- */
async function handleRedirectCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return null;

  try {
    const verifier = localStorage.getItem(PKCE_VERIFIER_KEY);
    if (!verifier) throw new Error("Missing PKCE verifier in localStorage.");

    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("client_id", COGNITO_CLIENT_ID);
    body.set("code", code);
    body.set("redirect_uri", CALLBACK_URL);
    body.set("code_verifier", verifier);

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error("Token exchange failed: " + txt);
    }
    const tok = await res.json();
    // tok: { id_token, access_token, refresh_token?, expires_in, token_type }
    if (tok.id_token) localStorage.setItem(ID_TOKEN_KEY, tok.id_token);
    if (tok.access_token) localStorage.setItem(ACCESS_TOKEN_KEY, tok.access_token);
    if (tok.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, tok.refresh_token);

    // cleanup URL to remove code & state
    window.history.replaceState({}, document.title, CALLBACK_URL);
    return tok;
  } catch (err) {
    console.error("handleRedirectCallback error", err);
    // show simple alert; for production show a friendly UI
    alert("Authentication failed: " + err.message);
    return null;
  }
}

/* ---------- Get stored ID token (refresh if possible) ---------- */
async function getAuthToken() {
  const id = localStorage.getItem(ID_TOKEN_KEY);
  if (id) return id;

  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refresh) return null;

  // try refresh token grant
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", COGNITO_CLIENT_ID);
  body.set("refresh_token", refresh);

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!res.ok) {
    console.warn("refresh token exchange failed", await res.text());
    return null;
  }
  const tok = await res.json();
  if (tok.id_token) localStorage.setItem(ID_TOKEN_KEY, tok.id_token);
  if (tok.access_token) localStorage.setItem(ACCESS_TOKEN_KEY, tok.access_token);
  return tok.id_token;
}

/* ---------- Sign out (clear tokens + redirect to Cognito logout) ---------- */
function signOut() {
  localStorage.removeItem(ID_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(PKCE_VERIFIER_KEY);

  const url = `${LOGOUT_ENDPOINT}?client_id=${encodeURIComponent(COGNITO_CLIENT_ID)}&logout_uri=${encodeURIComponent(SIGNOUT_URL)}`;
  window.location.href = url;
}

/* ---------- Minimal JWT parse to extract profile (no validation) ---------- */
function parseJwt(token) {
  if (!token) return {};
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(decoded)));
  } catch (e) {
    return {};
  }
}

/* ---------- UI helpers: update greeting + optional feed demo ---------- */
function updateAuthUI() {
  const id = localStorage.getItem(ID_TOKEN_KEY);
  const greetingEl = document.getElementById('greeting');
  if (!greetingEl) return;
  if (!id) {
    greetingEl.textContent = 'Hello —';
    return;
  }
  const profile = parseJwt(id);
  const name = profile.name || profile.email || profile.preferred_username || profile['cognito:username'] || 'User';
  greetingEl.textContent = `Hello, ${name}`;
}

/* Render small demo feed (no API calls) */
const samplePosts = [
  { id:'p1', user:'Explorer_Jane', text:'Amazing view from the mountain summit!', time: '2 hours ago' },
  { id:'p2', user:'Code_Master', text:'Quick demo of my new video pipeline', time: '5 minutes ago' }
];
function renderSampleFeed() {
  const feed = document.getElementById('feed');
  if (!feed) return;
  feed.innerHTML = '';
  samplePosts.forEach(p => {
    const el = document.createElement('div');
    el.className = 'post';
    el.innerHTML = `<strong>@${p.user}</strong> <span style="color:#6b7280">· ${p.time}</span><div style="margin-top:8px">${p.text}</div>`;
    feed.appendChild(el);
  });
}

/* ---------- On load: handle redirect and update UI ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  // If Cognito redirected back with ?code=..., exchange now.
  await handleRedirectCallback();
  // Update greeting (if token present)
  updateAuthUI();
  // render demo feed
  renderSampleFeed();

  // Make signIn/signOut globally callable (index.html uses signIn())
  window.signIn = signIn;
  window.signOut = signOut;
  window.getAuthToken = getAuthToken;
});
