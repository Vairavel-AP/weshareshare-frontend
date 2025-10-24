/* app.js
 - Plain JS frontend for PhotoShare (feed + upload modal)
 - Replace API_BASE and implement getAuthToken() to integrate with your AWS backend/Cognito.
*/

const API_BASE = "https://your-api-id.execute-api.YOUR-REGION.amazonaws.com/prod"; // <-- set your API base
// If you don't have APIs yet, the UI will still work locally with mock data.

document.addEventListener("DOMContentLoaded", init);

let POSTS = [...samplePosts]; // in-memory posts shown in feed

function init() {
  // header actions
  document.getElementById("open-upload").addEventListener("click", openUpload);
  document.getElementById("fab").addEventListener("click", openUpload);
  document.getElementById("close-upload").addEventListener("click", closeUpload);
  document.getElementById("cancel-upload").addEventListener("click", closeUpload);
  document.getElementById("upload-form").addEventListener("submit", submitUpload);

  renderFeed();
}

/* UI: open/close upload modal */
function openUpload() {
  document.getElementById("upload-modal").classList.remove("hidden");
  document.getElementById("upload-modal").setAttribute("aria-hidden", "false");
}
function closeUpload() {
  document.getElementById("upload-modal").classList.add("hidden");
  document.getElementById("upload-modal").setAttribute("aria-hidden", "true");
  // reset form
  document.getElementById("upload-form").reset();
  setStatus("");
}

/* upload flow: 1) get signed url 2) PUT file 3) create post */
async function submitUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById("file-input");
  const caption = document.getElementById("caption-input").value || "";
  const file = fileInput.files[0];
  if (!file) return alert("Please choose a file to upload.");

  try {
    setStatus("Requesting upload URL...");
    // 1) request presigned URL from backend
    const signed = await getSignedUrl(file.name, file.type);
    const uploadUrl = signed.uploadUrl;
    const s3Key = signed.s3Key;

    setStatus("Uploading file to S3...");
    // 2) PUT to S3 using presigned URL
    await uploadToS3(uploadUrl, file, file.type);

    setStatus("Creating post record...");
    // 3) create post metadata
    const created = await createPostRecord({ s3Key, caption, mediaType: file.type.startsWith("video/") ? "video" : "image" });

    // Update UI locally (post will be processed in backend to create thumbnail)
    const localPost = {
      postId: created.postId || ("local-" + Math.random().toString(36).slice(2,8)),
      username: "DemoUser123",
      createdAt: new Date().toISOString(),
      caption,
      mediaType: file.type.startsWith("video/") ? "video" : "image",
      thumbnailUrl: URL.createObjectURL(file),
      likesCount: 0,
      commentsCount: 0
    };
    POSTS.unshift(localPost);
    renderFeed();

    setStatus("Uploaded! Post created.");
    setTimeout(() => {
      closeUpload();
    }, 700);
  } catch (err) {
    console.error(err);
    setStatus("Upload failed: " + (err.message || err));
    alert("Upload failed. See console for details.");
  }
}

/* UI helpers */
function setStatus(text){ document.getElementById("upload-status").textContent = text; }
function renderFeed(){
  const feed = document.getElementById("feed");
  feed.innerHTML = "";
  POSTS.forEach(post => feed.appendChild(renderPostCard(post)));
}
function renderPostCard(post){
  const el = document.createElement("article");
  el.className = "post";

  // meta
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `
    <div style="display:flex;gap:12px;align-items:center">
      <div class="avatar">${(post.username||"U").charAt(0).toUpperCase()}</div>
      <div>
        <div class="username">@${post.username}</div>
        <div class="time">${timeAgo(post.createdAt)}</div>
      </div>
    </div>
  `;
  el.appendChild(meta);

  // media
  const media = document.createElement("div");
  media.className = "media";
  if (post.mediaType === "image") {
    const img = document.createElement("img");
    img.alt = post.caption || "Photo";
    img.src = post.thumbnailUrl || placeholderImage();
    media.appendChild(img);
  } else {
    // video placeholder
    media.innerHTML = `<div style="text-align:center;color:#fff"><div style="font-size:34px">▶</div><div style="margin-top:8px">Video Placeholder</div></div>`;
    media.style.background = "#0f1724";
  }
  el.appendChild(media);

  // caption + actions
  const caption = document.createElement("div");
  caption.className = "caption";
  caption.innerText = post.caption || "";
  el.appendChild(caption);

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.innerHTML = `
    <div>♡ ${formatCount(post.likesCount || 0)} Likes</div>
    <div>💬 ${formatCount(post.commentsCount || 0)} Comments</div>
  `;
  el.appendChild(actions);

  return el;
}

/* Utilities */
function timeAgo(iso){
  if(!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff/60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins/60);
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs/24);
  return `${days} days ago`;
}
function formatCount(n){
  if (n >= 1000000) return (n/1000000).toFixed(1) + "M";
  if (n >= 1000) return (n/1000).toFixed(1) + "K";
  return String(n);
}
function placeholderImage(){
  return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'><rect width='100%' height='100%' fill='#5b6bf3'/><text x='50%' y='50%' font-size='48' fill='white' dominant-baseline='middle' text-anchor='middle'>Photo Post</text></svg>`);
}

/* ------------------------------
   NETWORK: functions to call your API
   Replace getAuthToken() with your Cognito token retrieval (ID token).
   ------------------------------ */

/** Return a Promise resolving { uploadUrl, s3Key } from GET /signed-url */
async function getSignedUrl(filename, contentType) {
  // If your GET uses query parameters: /signed-url?filename=...&contentType=...
  // or you can implement a POST endpoint. Adjust accordingly.
  const token = await getAuthToken(); // implement below
  const q = new URL(`${API_BASE}/signed-url`);
  q.searchParams.set("filename", filename);
  q.searchParams.set("contentType", contentType);
  const res = await fetch(q.toString(), {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("signed-url error: " + txt);
  }
  return res.json(); // { uploadUrl, s3Key }
}

/** Upload file via presigned PUT URL */
async function uploadToS3(uploadUrl, file, contentType) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file
  });
  if (!res.ok) throw new Error("S3 upload failed: " + res.statusText);
  return true;
}

/** Create post metadata on backend */
async function createPostRecord(body) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("createPost error: " + txt);
  }
  return res.json();
}

/* ----------------------------------------------------------------------------
   Authentication helper (STUB)
   ----------------------------------------------------------------------------
   You must replace this with your real auth flow:
   - If you use Amazon Cognito, you can use Amazon Cognito Identity SDK or AWS Amplify.
   - After the user logs in, return the ID token here (not the refresh token).
   - For local dev or testing, you can return a fake token or empty string if API allows.
*/
async function getAuthToken() {
  // Example:
  // return localStorage.getItem('id_token') || '';
  // For now throw if API_BASE not configured to remind you:
  if (API_BASE.includes("your-api-id")) {
    // running in local only mode: return a placeholder
    return "LOCAL_FAKE_TOKEN";
  }
  // If integrated with Cognito, return the ID token here:
  // return await myAuth.ge
