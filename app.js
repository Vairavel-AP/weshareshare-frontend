/* app.js - WEShare frontend (vanilla JS)
   PKCE Auth with Cognito Hosted UI (values filled from user)
*/

/* ---------------- CONFIG (already filled) ---------------- */
const COGNITO_DOMAIN = "https://ap-south-1vmdpl6mvh.auth.ap-south-1.amazoncognito.com";
const COGNITO_CLIENT_ID = "6tmjg5udk8sgqrbj1lh5s1e8av";
const API_BASE = "https://your-api-id.execute-api.ap-south-1.amazonaws.com/prod"; // <-- replace when backend ready

const CALLBACK_URL = "https://vairavel-ap.github.io/weshareshare-frontend/home.html";
const SIGNOUT_URL  = "https://vairavel-ap.github.io/weshareshare-frontend/index.html";
const AUTH_ENDPOINT = `${COGNITO_DOMAIN}/oauth2/authorize`;
const TOKEN_ENDPOINT = `${COGNITO_DOMAIN}/oauth2/token`;
const LOGOUT_ENDPOINT = `${COGNITO_DOMAIN}/logout`;

/* Storage keys */
const PKCE_VERIFIER_KEY = "pkce_verifier_v1";
const ID_TOKEN_KEY = "cognito_id_token_v1";
const ACCESS_TOKEN_KEY = "cognito_access_token_v1";
const REFRESH_TOKEN_KEY = "cognito_refresh_token_v1";

/* --------- Startup ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  wireUI();
  await handleRedirectCallback();
  updateAuthUI();
  POSTS = [...samplePosts];
  renderFeed();
});

/* ---------- PKCE helpers ---------- */
function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
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

/* ---------- Auth flow ---------- */
async function signIn() {
  const { verifier, challenge } = await generatePKCECodes();
  localStorage.setItem(PKCE_VERIFIER_KEY, verifier);

  const state = Math.random().toString(36).slice(2);
  const scope = encodeURIComponent("openid profile email");
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
}

async function handleRedirectCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return null;

  try {
    const verifier = localStorage.getItem(PKCE_VERIFIER_KEY);
    if (!verifier) throw new Error("PKCE verifier missing.");

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
      console.error("token exchange failed:", await res.text());
      return null;
    }
    const tok = await res.json();
    localStorage.setItem(ID_TOKEN_KEY, tok.id_token);
    localStorage.setItem(ACCESS_TOKEN_KEY, tok.access_token);
    if (tok.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, tok.refresh_token);

    // remove query params for cleanliness
    window.history.replaceState({}, document.title, CALLBACK_URL);
    return tok;
  } catch (err) {
    console.error("Auth callback error", err);
    return null;
  }
}

async function getAuthToken() {
  const id = localStorage.getItem(ID_TOKEN_KEY);
  if (id) return id;

  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refresh) return null;

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
    console.warn("refresh token failed", await res.text());
    return null;
  }
  const tok = await res.json();
  if (tok.id_token) localStorage.setItem(ID_TOKEN_KEY, tok.id_token);
  if (tok.access_token) localStorage.setItem(ACCESS_TOKEN_KEY, tok.access_token);
  return tok.id_token;
}

function signOut() {
  localStorage.removeItem(ID_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(PKCE_VERIFIER_KEY);

  const url = `${LOGOUT_ENDPOINT}?client_id=${encodeURIComponent(COGNITO_CLIENT_ID)}&logout_uri=${encodeURIComponent(SIGNOUT_URL)}`;
  window.location.href = url;
}

/* ---------- UI wiring & state ---------- */

let POSTS = [];
const samplePosts = [
  {
    postId: "p1",
    username: "Explorer_Jane",
    createdAt: new Date(Date.now() - 1000*60*60*2).toISOString(),
    caption: "Amazing view from the mountain summit today!",
    mediaType: "image",
    thumbnailUrl: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=60",
    likesCount: 1200,
    commentsCount: 55
  },
  {
    postId: "p2",
    username: "Code_Master",
    createdAt: new Date(Date.now() - 1000*60*5).toISOString(),
    caption: "Quick demo of my new video pipeline",
    mediaType: "video",
    thumbnailUrl: "",
    likesCount: 90,
    commentsCount: 8
  }
];

function wireUI() {
  document.getElementById("open-upload").addEventListener("click", openUpload);
  document.getElementById("fab")?.addEventListener("click", openUpload);
  document.getElementById("close-upload").addEventListener("click", closeUpload);
  document.getElementById("cancel-upload").addEventListener("click", closeUpload);
  document.getElementById("upload-form").addEventListener("submit", submitUpload);
  document.getElementById("signout-btn").addEventListener("click", () => signOut());

  const maybeSignIn = document.getElementById("signin-btn");
  if (maybeSignIn) maybeSignIn.addEventListener("click", () => signIn());
}

function updateAuthUI() {
  const greeting = document.getElementById("greeting");
  const id = localStorage.getItem(ID_TOKEN_KEY);
  if (!id) {
    if (greeting) greeting.textContent = "Hello —";
    return;
  }
  const payload = parseJwt(id);
  const name = payload.name || payload.email || payload.preferred_username || payload['cognito:username'] || "User";
  if (greeting) greeting.textContent = `Hello, ${name}`;
}

/* ---------- Upload modal UI ---------- */
function openUpload() { document.getElementById("upload-modal").classList.remove("hidden"); }
function closeUpload() { document.getElementById("upload-modal").classList.add("hidden"); document.getElementById("upload-form").reset(); setStatus(""); }
function setStatus(msg) { const el = document.getElementById("upload-status"); if (el) el.textContent = msg; }

async function submitUpload(e) {
  e.preventDefault();
  const file = document.getElementById("file-input").files[0];
  const caption = document.getElementById("caption-input").value || "";
  if (!file) return alert("Choose a file.");

  try {
    setStatus("Requesting upload URL...");
    const signed = await getSignedUrl(file.name, file.type);
    setStatus("Uploading file...");
    await uploadToS3(signed.uploadUrl, file, file.type);
    setStatus("Creating post record...");
    const created = await createPostRecord({ s3Key: signed.s3Key, caption, mediaType: file.type.startsWith("video/") ? "video" : "image" });

    POSTS.unshift({
      postId: created.postId || ("local-" + Math.random().toString(36).slice(2,8)),
      username: parseJwt(localStorage.getItem(ID_TOKEN_KEY) || "")?.email || "Me",
      createdAt: new Date().toISOString(),
      caption,
      mediaType: file.type.startsWith("video/") ? "video" : "image",
      thumbnailUrl: URL.createObjectURL(file),
      likesCount: 0,
      commentsCount: 0
    });
    renderFeed();
    setStatus("Uploaded successfully.");
    setTimeout(closeUpload, 800);
  } catch (err) {
    console.error(err);
    setStatus("Upload failed.");
    alert("Upload failed: " + (err.message || err));
  }
}

/* ---------- Network helpers (replace API_BASE when ready) ---------- */
async function getSignedUrl(filename, contentType) {
  const token = await getAuthToken();
  const q = new URL(`${API_BASE}/signed-url`);
  q.searchParams.set("filename", filename);
  q.searchParams.set("contentType", contentType);
  const res = await fetch(q.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("signed-url failed: " + await res.text());
  return res.json();
}
async function uploadToS3(uploadUrl, file, contentType) {
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if (!res.ok) throw new Error("S3 upload failed: " + res.statusText);
  return true;
}
async function createPostRecord(body) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/posts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("createPost failed: " + await res.text());
  return res.json();
}

/* ---------- Feed rendering ---------- */
function renderFeed(){
  const feed = document.getElementById("feed");
  if (!feed) return;
  feed.innerHTML = "";
  POSTS.forEach(p => feed.appendChild(renderPostCard(p)));
}
function renderPostCard(post) {
  const el = document.createElement("article");
  el.className = "post";
  el.innerHTML = `
    <div class="meta">
      <div style="display:flex;gap:12px;align-items:center">
        <div class="avatar">${(post.username||'U').charAt(0).toUpperCase()}</div>
        <div>
          <div class="username">@${post.username}</div>
          <div class="time">${timeAgo(post.createdAt)}</div>
        </div>
      </div>
    </div>
    <div class="media">${ post.mediaType === 'image' ? `<img src="${post.thumbnailUrl || placeholderImage()}" alt="photo" />` : `<div style="text-align:center;color:#fff;padding:80px 0">▶ Video Placeholder</div>`}</div>
    <div class="caption">${escapeHtml(post.caption || "")}</div>
    <div class="actions">♡ ${formatCount(post.likesCount||0)} Likes &nbsp; · &nbsp; 💬 ${formatCount(post.commentsCount||0)} Comments</div>
  `;
  return el;
}

/* ---------- Small helpers ---------- */
function timeAgo(iso){ if(!iso) return ""; const diff = Date.now() - new Date(iso).getTime(); const mins=Math.floor(diff/60000); if(mins<1) return "just now"; if(mins<60) return `${mins} minutes ago`; const hrs=Math.floor(mins/60); if(hrs<24) return `${hrs} hours ago`; return `${Math.floor(hrs/24)} days ago`; }
function formatCount(n){ if(n>=1000000) return (n/1000000).toFixed(1)+"M"; if(n>=1000) return (n/1000).toFixed(1)+"K"; return String(n); }
function placeholderImage(){ return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'><rect width='100%' height='100%' fill='#5b6bf3'/><text x='50%' y='50%' font-size='48' fill='white' dominant-baseline='middle' text-anchor='middle'>Photo</text></svg>`); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function parseJwt(token){
  if(!token) return {};
  try {
    const p = token.split(".")[1];
    const json = atob(p.replace(/-/g,"+").replace(/_/g,"/"));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch(e) { return {}; }
}
