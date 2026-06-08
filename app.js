/* Progress Board
   --------------------------------------------------------------------------
   Entries live in this GitHub repo so anyone can view them:
     - data/entries.json   -> the list of entries (text + file references)
     - uploads/            -> the uploaded image & PDF files

   VIEWING is public: the page reads the published files from the repo, no
   login required.

   ADDING requires a GitHub personal access token with "Contents: Read and
   write" permission on this repo. The token is stored only in the editor's
   own browser (localStorage) and is used to commit new entries/files via the
   GitHub API. It is never written into the repo.
   -------------------------------------------------------------------------- */

const REPO = {
  owner: "arossi58",
  name: "rossi-progress-platform",
  branch: "main",
};

const DATA_PATH = "data/entries.json";
const UPLOAD_DIR = "uploads";
const TOKEN_KEY = "progress-board-token";

/* Public raw URL for reading a file from the repo (no auth needed) */
function rawUrl(path) {
  return `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/${REPO.branch}/${path}`;
}

/* ---- DOM ---- */
const editorBtn = document.getElementById("editor-btn");
const modalOverlay = document.getElementById("modal-overlay");
const modalClose = document.getElementById("modal-close");
const modalSignin = document.getElementById("modal-signin");
const modalSignedin = document.getElementById("modal-signedin");
const tokenInput = document.getElementById("token");
const tokenError = document.getElementById("token-error");
const saveTokenBtn = document.getElementById("save-token");
const clearTokenBtn = document.getElementById("clear-token");
const addCard = document.getElementById("add-card");
const form = document.getElementById("entry-form");
const submitBtn = document.getElementById("submit-btn");
const entriesEl = document.getElementById("entries");

/* ---- Token handling ---- */
function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  reflectAuthState();
}

function reflectAuthState() {
  const signedIn = !!getToken();
  addCard.hidden = !signedIn;
  editorBtn.classList.toggle("signed-in", signedIn);
  editorBtn.title = signedIn ? "Editor: signed in" : "Editor access";
  modalSignin.hidden = signedIn;
  modalSignedin.hidden = !signedIn;
}

/* Verify the token actually works AND has write access to this repo. */
async function validateToken(token) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO.owner}/${REPO.name}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (res.status === 401) return { ok: false, message: "Invalid or expired token." };
    if (res.status === 404)
      return { ok: false, message: "This token can't access this repository." };
    if (!res.ok) return { ok: false, message: `GitHub error ${res.status}.` };
    const json = await res.json();
    if (!json.permissions || !json.permissions.push)
      return { ok: false, message: "Token is missing Contents: write access." };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: "Network error: " + e.message };
  }
}

/* ---- Modal ---- */
function openModal() {
  reflectAuthState(); // show the right panel
  tokenError.hidden = true;
  modalOverlay.hidden = false;
  if (!getToken()) tokenInput.focus();
}

function closeModal() {
  modalOverlay.hidden = true;
  tokenInput.value = "";
  tokenError.hidden = true;
}

editorBtn.addEventListener("click", openModal);
modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalOverlay.hidden) closeModal();
});

saveTokenBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    tokenError.textContent = "Please paste a GitHub token first.";
    tokenError.hidden = false;
    return;
  }
  saveTokenBtn.disabled = true;
  saveTokenBtn.textContent = "Verifying…";
  tokenError.hidden = true;

  const result = await validateToken(token);

  saveTokenBtn.disabled = false;
  saveTokenBtn.textContent = "Verify & Save";

  if (!result.ok) {
    tokenError.textContent = result.message;
    tokenError.hidden = false;
    return;
  }

  setToken(token);
  closeModal();
  loadAndRender(); // refresh using authenticated (fresh) data
});

clearTokenBtn.addEventListener("click", () => {
  setToken("");
  closeModal();
  loadAndRender(); // remove the Delete buttons for viewers
});

/* ---- GitHub API helpers ---- */
function apiUrl(path) {
  return `https://api.github.com/repos/${REPO.owner}/${REPO.name}/contents/${path}`;
}

function githubHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/vnd.github+json",
  };
}

/* UTF-8 safe base64 of a string */
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/* Read a File as raw base64 (no data: prefix) for the GitHub API */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* PUT a file into the repo. Returns the API response JSON. */
async function commitFile(path, base64Content, message, sha) {
  const body = {
    message,
    content: base64Content,
    branch: REPO.branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl(path), {
    method: "PUT",
    headers: githubHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`GitHub API ${res.status}: ${detail}`);
  }
  return res.json();
}

/* DELETE a file from the repo (needs its blob sha). */
async function deleteFile(path, sha, message) {
  const res = await fetch(apiUrl(path), {
    method: "DELETE",
    headers: githubHeaders(),
    body: JSON.stringify({ message, sha, branch: REPO.branch }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
}

/* Look up the current blob sha for a file path (null if it doesn't exist). */
async function getFileSha(path) {
  const res = await fetch(apiUrl(path), { headers: githubHeaders() });
  if (!res.ok) return null;
  return (await res.json()).sha;
}

/* Turn a stored raw URL back into its in-repo path. */
function pathFromUrl(url) {
  const prefix = `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/${REPO.branch}/`;
  return url && url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

/* Fetch the current entries.json + its sha (sha needed to update it). */
async function fetchEntriesFile() {
  // Use the API when signed in (always fresh + gives sha); fall back to raw.
  const token = getToken();
  if (token) {
    const res = await fetch(apiUrl(DATA_PATH), { headers: githubHeaders() });
    if (res.status === 404) return { entries: [], sha: null };
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const json = await res.json();
    const content = decodeURIComponent(escape(atob(json.content)));
    return { entries: JSON.parse(content || "[]"), sha: json.sha };
  }
  // Public read for viewers
  const res = await fetch(`${rawUrl(DATA_PATH)}?cb=${Date.now()}`);
  if (!res.ok) return { entries: [], sha: null };
  return { entries: await res.json(), sha: null };
}

/* ---- Rendering ---- */
function renderFile(file) {
  const item = document.createElement("div");
  item.className = "file-item";
  const url = file.url || file.data; // url = repo path, data = legacy fallback

  if (file.type && file.type.startsWith("image/")) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    const img = document.createElement("img");
    img.src = url;
    img.alt = file.name;
    link.appendChild(img);
    item.appendChild(link);
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "file-pdf";
    link.innerHTML = '<span class="pdf-icon">📄</span><span>Open PDF</span>';
    item.appendChild(link);
  }

  const name = document.createElement("div");
  name.className = "file-name";
  const nameLink = document.createElement("a");
  nameLink.href = url;
  nameLink.target = "_blank";
  nameLink.rel = "noopener";
  nameLink.textContent = file.name;
  name.appendChild(nameLink);
  item.appendChild(name);

  return item;
}

function renderEntries(entries) {
  entriesEl.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No progress entries yet.";
    entriesEl.appendChild(empty);
    return;
  }

  const signedIn = !!getToken();

  entries.forEach((entry) => {
    const wrapper = document.createElement("article");
    wrapper.className = "entry";

    const week = document.createElement("h3");
    week.className = "entry-week";
    week.textContent = entry.week;

    // Editors get a header row with a Delete button; viewers just see the title.
    if (signedIn) {
      const header = document.createElement("div");
      header.className = "entry-header";
      const del = document.createElement("button");
      del.className = "btn-delete";
      del.textContent = "Delete";
      del.addEventListener("click", () => deleteEntry(entry));
      header.appendChild(week);
      header.appendChild(del);
      wrapper.appendChild(header);
    } else {
      wrapper.appendChild(week);
    }

    const desc = document.createElement("p");
    desc.className = "entry-description";
    desc.textContent = entry.description;

    const files = document.createElement("div");
    files.className = "entry-files";
    if (entry.files && entry.files.length) {
      entry.files.forEach((f) => files.appendChild(renderFile(f)));
    } else {
      files.classList.add("empty");
    }

    wrapper.appendChild(desc);
    wrapper.appendChild(files);
    entriesEl.appendChild(wrapper);
  });
}

async function loadAndRender() {
  try {
    const { entries } = await fetchEntriesFile();
    renderEntries(entries);
  } catch (err) {
    entriesEl.innerHTML =
      '<p class="hint">Could not load entries: ' + err.message + "</p>";
  }
}

/* ---- Delete an entry (editors only) ---- */
async function deleteEntry(entry) {
  if (!getToken()) return;
  if (!confirm(`Delete "${entry.week}"? This also removes its files.`)) return;

  try {
    // Remove each uploaded file
    for (const f of entry.files || []) {
      const path = pathFromUrl(f.url || "");
      if (!path) continue;
      const sha = await getFileSha(path);
      if (sha) await deleteFile(path, sha, `Remove file ${f.name}`);
    }

    // Remove the entry from entries.json
    const { entries, sha } = await fetchEntriesFile();
    const updated = entries.filter((e) => e.id !== entry.id);
    await commitFile(
      DATA_PATH,
      toBase64(JSON.stringify(updated, null, 2)),
      `Delete progress entry: ${entry.week}`,
      sha
    );

    renderEntries(updated);
  } catch (err) {
    alert("Delete failed:\n" + err.message);
  }
}

/* ---- Publish a new entry ---- */
function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!getToken()) {
    alert("Save your GitHub token first.");
    return;
  }

  const week = document.getElementById("week").value.trim();
  const description = document.getElementById("description").value.trim();
  const fileInput = document.getElementById("files");

  submitBtn.disabled = true;
  submitBtn.textContent = "Publishing…";

  try {
    // 1) Upload each file into uploads/
    const fileRefs = [];
    let i = 0;
    for (const file of fileInput.files) {
      const stamp = `${Date.now()}-${i++}`;
      const path = `${UPLOAD_DIR}/${stamp}-${safeName(file.name)}`;
      const base64 = await readFileAsBase64(file);
      await commitFile(path, base64, `Add file ${file.name}`);
      fileRefs.push({ name: file.name, type: file.type, url: rawUrl(path) });
    }

    // 2) Append the entry to entries.json and commit it
    const { entries, sha } = await fetchEntriesFile();
    entries.push({
      id: Date.now().toString(),
      week,
      description,
      files: fileRefs,
    });
    await commitFile(
      DATA_PATH,
      toBase64(JSON.stringify(entries, null, 2)),
      `Add progress entry: ${week}`,
      sha
    );

    form.reset();
    renderEntries(entries);
    alert("Published! It may take a moment to appear for other viewers.");
  } catch (err) {
    alert("Publish failed:\n" + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Publish Entry";
  }
});

/* ---- Init ---- */
reflectAuthState();
loadAndRender();
