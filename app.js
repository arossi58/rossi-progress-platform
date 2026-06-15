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
const editorEl = document.getElementById("description");
const rteToolbar = document.querySelector(".rte-toolbar");
const addCardTitle = document.getElementById("add-card-title");
const weekInput = document.getElementById("week");
const filesInput = document.getElementById("files");
const filesLabel = document.getElementById("files-label");
const existingFilesField = document.getElementById("existing-files-field");
const existingFilesEl = document.getElementById("existing-files");
const cancelEditBtn = document.getElementById("cancel-edit-btn");

/* The entry currently being edited (null = composing a brand-new entry). */
let editingEntry = null;

/* ---- Rich text editor (description) ---- */
/* The toolbar drives a contenteditable region via execCommand. Native
   keyboard shortcuts (Ctrl/Cmd+B/I/U) work without extra wiring. */
function initRichTextEditor() {
  if (!rteToolbar || !editorEl) return;

  rteToolbar.addEventListener("click", (e) => {
    const btn = e.target.closest(".rte-btn");
    if (!btn) return;
    e.preventDefault();
    const cmd = btn.dataset.cmd;
    editorEl.focus();

    if (cmd === "createLink") {
      const url = prompt("Link URL:", "https://");
      if (url) document.execCommand("createLink", false, url);
    } else if (cmd === "formatBlock") {
      // Toggle heading: if already a heading, drop back to a paragraph.
      const block = document.queryCommandValue("formatBlock");
      const toHeading = !/^h\d$/i.test(block);
      document.execCommand("formatBlock", false, toHeading ? btn.dataset.value : "p");
    } else {
      document.execCommand(cmd, false, null);
    }
    updateToolbarState();
  });

  // Reflect active formatting on the toolbar buttons.
  ["keyup", "mouseup", "input"].forEach((evt) =>
    editorEl.addEventListener(evt, updateToolbarState)
  );
}

function updateToolbarState() {
  if (!rteToolbar) return;
  rteToolbar.querySelectorAll(".rte-btn").forEach((btn) => {
    const cmd = btn.dataset.cmd;
    let on = false;
    try {
      if (cmd === "bold" || cmd === "italic" || cmd === "underline") {
        on = document.queryCommandState(cmd);
      } else if (cmd === "insertUnorderedList" || cmd === "insertOrderedList") {
        on = document.queryCommandState(cmd);
      } else if (cmd === "formatBlock") {
        on = /^h\d$/i.test(document.queryCommandValue("formatBlock"));
      }
    } catch (_) {
      /* queryCommandState can throw when the editor isn't focused */
    }
    btn.classList.toggle("active", on);
  });
}

/* Read the editor's content, returning "" when it's visually empty so the
   required-field check below behaves like the old textarea. */
function getEditorHtml() {
  const html = editorEl.innerHTML.trim();
  const text = editorEl.textContent.replace(/ /g, " ").trim();
  const hasMedia = /<img\b/i.test(html);
  if (!text && !hasMedia) return "";
  return html;
}

function clearEditor() {
  editorEl.innerHTML = "";
}

/* ---- Description sanitizing + rendering ---- */
const ALLOWED_TAGS = {
  A: ["href"],
  B: [], STRONG: [], I: [], EM: [], U: [],
  P: [], BR: [], DIV: [], SPAN: [],
  UL: [], OL: [], LI: [],
  H1: [], H2: [], H3: [], BLOCKQUOTE: [], CODE: [], PRE: [],
};

/* Turn untrusted HTML into a safe DocumentFragment: drop scripts/styles,
   unwrap unknown tags, strip every attribute except an allow-list, and
   neutralize javascript: links. */
function sanitizeHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;

      const tag = child.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") {
        child.remove();
        return;
      }
      if (!ALLOWED_TAGS[tag]) {
        // Unwrap: keep the (sanitized) children, drop the element itself.
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        child.remove();
        return;
      }

      const allowedAttrs = ALLOWED_TAGS[tag];
      [...child.attributes].forEach((attr) => {
        if (!allowedAttrs.includes(attr.name.toLowerCase())) {
          child.removeAttribute(attr.name);
        }
      });

      if (tag === "A") {
        const href = child.getAttribute("href") || "";
        if (/^\s*(javascript|data):/i.test(href)) {
          child.removeAttribute("href");
        } else if (href) {
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer");
        }
      }

      walk(child);
    });
  };

  walk(tpl.content);
  return tpl.content;
}

/* Render a stored description into an element. New entries are sanitized
   HTML; legacy plain-text entries keep their line breaks. */
function renderDescription(text) {
  const el = document.createElement("div");
  el.className = "entry-description";
  const value = text || "";

  if (/<[a-z][\s\S]*>/i.test(value)) {
    el.appendChild(sanitizeHtml(value));
  } else {
    value.split("\n").forEach((line, i) => {
      if (i) el.appendChild(document.createElement("br"));
      el.appendChild(document.createTextNode(line));
    });
  }
  return el;
}

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
function isImageFile(file) {
  return !!(file.type && file.type.startsWith("image/"));
}

/* `gallery` is the entry's list of image files; `galleryIndex` is this
   file's position within it (used to open the lightbox at the right slide). */
function renderFile(file, gallery, galleryIndex) {
  const item = document.createElement("div");
  item.className = "file-item";
  const url = file.url || file.data; // url = repo path, data = legacy fallback

  if (isImageFile(file)) {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "file-thumb";
    thumb.setAttribute("aria-label", `View photo: ${file.name}`);
    const img = document.createElement("img");
    img.src = url;
    img.alt = file.name;
    img.loading = "lazy";
    thumb.appendChild(img);
    thumb.addEventListener("click", () => openLightbox(gallery, galleryIndex));
    item.appendChild(thumb);
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

    // Editors get a header row with Edit/Delete buttons; viewers just see the title.
    if (signedIn) {
      const header = document.createElement("div");
      header.className = "entry-header";

      const actions = document.createElement("div");
      actions.className = "entry-actions";

      const edit = document.createElement("button");
      edit.className = "btn-delete";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => startEdit(entry));

      const del = document.createElement("button");
      del.className = "btn-delete";
      del.textContent = "Delete";
      del.addEventListener("click", () => deleteEntry(entry));

      actions.appendChild(edit);
      actions.appendChild(del);
      header.appendChild(week);
      header.appendChild(actions);
      wrapper.appendChild(header);
    } else {
      wrapper.appendChild(week);
    }

    const desc = renderDescription(entry.description);

    const files = document.createElement("div");
    files.className = "entry-files";
    if (entry.files && entry.files.length) {
      // Build this entry's photo gallery so the lightbox can page through it.
      const gallery = entry.files
        .filter(isImageFile)
        .map((f) => ({ url: f.url || f.data, name: f.name }));
      let galleryIndex = 0;
      entry.files.forEach((f) => {
        const idx = isImageFile(f) ? galleryIndex++ : -1;
        files.appendChild(renderFile(f, gallery, idx));
      });
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

/* ---- Edit an existing entry (editors only) ---- */
/* URLs of the editing entry's files the user has marked for removal. */
const filesToRemove = new Set();

function fileKey(f) {
  return f.url || f.data || "";
}

/* Show the editing entry's current files, each with a Remove/Undo toggle. */
function renderExistingFilesUI(entry) {
  existingFilesEl.innerHTML = "";
  const files = entry.files || [];
  if (!files.length) {
    existingFilesField.hidden = true;
    return;
  }
  existingFilesField.hidden = false;

  files.forEach((f) => {
    const key = fileKey(f);
    const row = document.createElement("div");
    row.className = "existing-file";

    const name = document.createElement("span");
    name.className = "existing-file-name";
    name.textContent = f.name;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "existing-file-toggle";
    toggle.textContent = "Remove";
    toggle.addEventListener("click", () => {
      if (filesToRemove.has(key)) {
        filesToRemove.delete(key);
        row.classList.remove("removing");
        toggle.textContent = "Remove";
      } else {
        filesToRemove.add(key);
        row.classList.add("removing");
        toggle.textContent = "Undo";
      }
    });

    row.appendChild(name);
    row.appendChild(toggle);
    existingFilesEl.appendChild(row);
  });
}

/* Load an entry into the form for editing. */
function startEdit(entry) {
  if (!getToken()) return;
  editingEntry = entry;
  filesToRemove.clear();

  addCardTitle.textContent = "Edit Progress";
  submitBtn.textContent = "Update Entry";
  cancelEditBtn.hidden = false;
  filesLabel.textContent = "Add more files (images & PDFs)";

  weekInput.value = entry.week || "";
  // Reuse the (already-sanitized) render path so the editor shows formatted,
  // editable content — and legacy plain text keeps its line breaks.
  editorEl.innerHTML = renderDescription(entry.description).innerHTML;

  renderExistingFilesUI(entry);
  filesInput.value = "";

  addCard.hidden = false;
  addCard.scrollIntoView({ behavior: "smooth", block: "start" });
  editorEl.focus();
}

/* Return the form to "add a new entry" state. */
function exitEditMode() {
  editingEntry = null;
  filesToRemove.clear();
  addCardTitle.textContent = "Add Progress";
  submitBtn.textContent = "Publish Entry";
  cancelEditBtn.hidden = true;
  filesLabel.textContent = "Files (images & PDFs)";
  existingFilesField.hidden = true;
  existingFilesEl.innerHTML = "";
  form.reset();
  clearEditor();
}

cancelEditBtn.addEventListener("click", exitEditMode);

/* ---- Publish / update an entry ---- */
function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/* Upload the chosen files into uploads/ and return their entry refs. */
async function uploadSelectedFiles(fileList) {
  const refs = [];
  let i = 0;
  for (const file of fileList) {
    const stamp = `${Date.now()}-${i++}`;
    const path = `${UPLOAD_DIR}/${stamp}-${safeName(file.name)}`;
    const base64 = await readFileAsBase64(file);
    await commitFile(path, base64, `Add file ${file.name}`);
    refs.push({ name: file.name, type: file.type, url: rawUrl(path) });
  }
  return refs;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!getToken()) {
    alert("Save your GitHub token first.");
    return;
  }

  const week = weekInput.value.trim();
  const description = getEditorHtml();

  if (!description) {
    alert("Please add a description.");
    editorEl.focus();
    return;
  }

  const isEdit = !!editingEntry;
  submitBtn.disabled = true;
  submitBtn.textContent = isEdit ? "Updating…" : "Publishing…";

  try {
    // 1) Upload any newly chosen files.
    const newRefs = await uploadSelectedFiles(filesInput.files);

    // 2) Update entries.json.
    const { entries, sha } = await fetchEntriesFile();
    let updated;

    if (isEdit) {
      // Delete the files the editor marked for removal.
      const removed = (editingEntry.files || []).filter((f) =>
        filesToRemove.has(fileKey(f))
      );
      for (const f of removed) {
        const path = pathFromUrl(f.url || "");
        if (!path) continue;
        const fileSha = await getFileSha(path);
        if (fileSha) await deleteFile(path, fileSha, `Remove file ${f.name}`);
      }

      const keptFiles = (editingEntry.files || []).filter(
        (f) => !filesToRemove.has(fileKey(f))
      );
      updated = entries.map((en) =>
        en.id === editingEntry.id
          ? { ...en, week, description, files: keptFiles.concat(newRefs) }
          : en
      );
      await commitFile(
        DATA_PATH,
        toBase64(JSON.stringify(updated, null, 2)),
        `Edit progress entry: ${week}`,
        sha
      );
    } else {
      entries.push({
        id: Date.now().toString(),
        week,
        description,
        files: newRefs,
      });
      updated = entries;
      await commitFile(
        DATA_PATH,
        toBase64(JSON.stringify(updated, null, 2)),
        `Add progress entry: ${week}`,
        sha
      );
    }

    exitEditMode();
    renderEntries(updated);
    alert(
      isEdit
        ? "Updated! It may take a moment to refresh for other viewers."
        : "Published! It may take a moment to appear for other viewers."
    );
  } catch (err) {
    alert((isEdit ? "Update" : "Publish") + " failed:\n" + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingEntry ? "Update Entry" : "Publish Entry";
  }
});

/* ---- Lightbox gallery ---- */
const lightboxEl = document.getElementById("lightbox");
const lbImg = document.getElementById("lb-img");
const lbCaption = document.getElementById("lb-caption");
const lbCounter = document.getElementById("lb-counter");
const lbClose = document.getElementById("lb-close");
const lbPrev = document.getElementById("lb-prev");
const lbNext = document.getElementById("lb-next");

let lbGallery = [];
let lbIndex = 0;

function showLightboxSlide() {
  const item = lbGallery[lbIndex];
  if (!item) return;
  lbImg.src = item.url;
  lbImg.alt = item.name || "";
  lbCaption.textContent = item.name || "";
  lbCounter.textContent = `${lbIndex + 1} / ${lbGallery.length}`;
}

function openLightbox(gallery, index) {
  if (!gallery || !gallery.length) return;
  lbGallery = gallery;
  lbIndex = Math.max(0, index);
  lightboxEl.classList.toggle("single", gallery.length < 2);
  showLightboxSlide();
  lightboxEl.hidden = false;
}

function closeLightbox() {
  lightboxEl.hidden = true;
  lbImg.src = "";
  lbGallery = [];
}

function stepLightbox(delta) {
  if (lbGallery.length < 2) return;
  lbIndex = (lbIndex + delta + lbGallery.length) % lbGallery.length;
  showLightboxSlide();
}

lbClose.addEventListener("click", closeLightbox);
lbPrev.addEventListener("click", () => stepLightbox(-1));
lbNext.addEventListener("click", () => stepLightbox(1));
lightboxEl.addEventListener("click", (e) => {
  // Click on the dark backdrop (not the image or a control) closes it.
  if (e.target === lightboxEl || e.target.classList.contains("lb-figure")) {
    closeLightbox();
  }
});
document.addEventListener("keydown", (e) => {
  if (lightboxEl.hidden) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowLeft") stepLightbox(-1);
  else if (e.key === "ArrowRight") stepLightbox(1);
});

/* ---- Init ---- */
initRichTextEditor();
reflectAuthState();
loadAndRender();
