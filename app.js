/* app.js - Implicit flow (response_type=token) for Cognito Hosted UI
   - Uses your provided Cognito domain and client id
   - Callback: https://vairavel-ap.github.io/weshareshare-frontend/home.html
   - Sign-out redirect: https://vairavel-ap.github.io/weshareshare-frontend/index.html
   - Stores tokens in localStorage under keys:
       cognito_id_token_v1, cognito_access_token_v1
*/

/* ========== CONFIG (filled with your values) ========== */
const COGNITO_DOMAIN = "https://ap-south-1vmdpl6mvh.auth.ap-south-1.amazoncognito.com";
const COGNITO_CLIENT_ID = "6tmjg5udk8sgqrbj1lh5s1e8av";

const CALLBACK_URL = "https://vairavel-ap.github.io/weshareshare-frontend/home.html";
const SIGNOUT_URL  = "https://vairavel-ap.github.io/weshareshare-frontend/index.html";

const LOGIN_ENDPOINT = `${COGNITO_DOMAIN}/login`;
const LOGOUT_ENDPOINT = `${COGNITO_DOMAIN}/logout`;

/* ========== Helpers to parse/store tokens from URL hash ========== */
function parseHashTokens() {
  if (!window.location.hash || window.location.hash.length < 2) return null;
  const hash = window.location.hash.substring(1); // remove '#'
  const params = new URLSearchParams(hash.replace(/\+/g, '%20')); // treat + as space if present
  const id_token = params.get('id_token');
  const access_token = params.get('access_token');
  const token_type = params.get('token_type');
  const expires_in = params.get('expires_in');

  if (id_token) localStorage.setItem('cognito_id_token_v1', id_token);
  if (access_token) localStorage.setItem('cognito_access_token_v1', access_token);

  // remove hash from URL for cleanliness
  if (window.history && window.history.replaceState) {
    const cleanUrl = window.location.origin + window.location.pathname + window.location.search;
    window.history.replaceState({}, document.title, cleanUrl);
  }
  return { id_token, access_token, token_type, expires_in };
}

/* Very small JWT decode (no validation) */
function parseJwt(token) {
  if (!token) return {};
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g,'+').replace(/_/g,'/'));
    return JSON.parse(decodeURIComponent(escape(decoded)));
  } catch(e) {
    return {};
  }
}

/* ========== UI helpers ========== */
function updateAuthUI() {
  const greetingEl = document.getElementById('greeting');
  if (!greetingEl) return;
  const id = localStorage.getItem('cognito_id_token_v1');
  if (!id) {
    greetingEl.textContent = 'Hello —';
    return;
  }
  const profile = parseJwt(id);
  const name = profile.name || profile.email || profile['cognito:username'] || 'User';
  greetingEl.textContent = `Hello, ${name}`;
}

/* Render small demo feed (no backend) */
function renderSampleFeed() {
  const feed = document.getElementById('feed');
  if (!feed) return;
  feed.innerHTML = '';
  const samplePosts = [
    { id:'p1', user:'Explorer_Jane', text:'Amazing view from the mountain summit!', time:'2 hours ago' },
    { id:'p2', user:'Code_Master', text:'Quick demo of my new video pipeline', time:'5 minutes ago' }
  ];
  samplePosts.forEach(p => {
    const el = document.createElement('div');
    el.className = 'post';
    el.innerHTML = `<strong>@${p.user}</strong> <span style="color:#6b7280">· ${p.time}</span><div style="margin-top:8px">${p.text}</div>`;
    feed.appendChild(el);
  });
}

/* ========== Sign-in (implicit flow) ========== */
/* Redirects the browser to the Cognito Hosted UI with response_type=token */
function signIn() {
  const scope = encodeURIComponent('email openid phone'); // matches your working URL
  const url = `${LOGIN_ENDPOINT}?client_id=${encodeURIComponent(COGNITO_CLIENT_ID)}&response_type=token&scope=${scope}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}`;
  window.location.href = url;
}

/* ========== Sign-out (clear tokens and call Hosted UI logout) ========== */
function signOut() {
  localStorage.removeItem('cognito_id_token_v1');
  localStorage.removeItem('cognito_access_token_v1');
  // redirect to hosted logout, which will then redirect back to SIGNOUT_URL
  const url = `${LOGOUT_ENDPOINT}?client_id=${encodeURIComponent(COGNITO_CLIENT_ID)}&logout_uri=${encodeURIComponent(SIGNOUT_URL)}`;
  window.location.href = url;
}

/* ========== On-load: parse tokens (if present) and update UI ========== */
document.addEventListener('DOMContentLoaded', () => {
  // If Cognito redirected returning hash tokens, parse and store them.
  parseHashTokens();
  // Update greeting if token exists
  updateAuthUI();
  // render demo feed
  renderSampleFeed();

  // expose signIn/signOut globally for index.html / buttons
  window.signIn = signIn;
  window.signOut = signOut;
});
