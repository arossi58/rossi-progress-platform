/* Progress Board — stores entries in the browser's localStorage.
   Files (images & PDFs) are saved as base64 data URLs so they persist
   between page loads without needing a server. */

const STORAGE_KEY = "progress-board-entries";

const form = document.getElementById("entry-form");
const entriesEl = document.getElementById("entries");

/* ---- Storage helpers ---- */
function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/* Read a File object as a base64 data URL */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---- Rendering ---- */
function renderFile(file) {
  const item = document.createElement("div");
  item.className = "file-item";

  if (file.type.startsWith("image/")) {
    const link = document.createElement("a");
    link.href = file.data;
    link.target = "_blank";
    link.rel = "noopener";

    const img = document.createElement("img");
    img.src = file.data;
    img.alt = file.name;
    link.appendChild(img);
    item.appendChild(link);
  } else {
    // PDF (or any non-image)
    const link = document.createElement("a");
    link.href = file.data;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "file-pdf";
    link.innerHTML = '<span class="pdf-icon">📄</span><span>Open PDF</span>';
    item.appendChild(link);
  }

  const name = document.createElement("div");
  name.className = "file-name";
  const nameLink = document.createElement("a");
  nameLink.href = file.data;
  nameLink.target = "_blank";
  nameLink.rel = "noopener";
  nameLink.textContent = file.name;
  name.appendChild(nameLink);
  item.appendChild(name);

  return item;
}

function renderEntries() {
  const entries = loadEntries();
  entriesEl.innerHTML = "";

  entries.forEach((entry) => {
    const wrapper = document.createElement("article");
    wrapper.className = "entry";

    // Header row: week title + delete button
    const headerRow = document.createElement("div");
    headerRow.className = "entry-header";

    const week = document.createElement("h3");
    week.className = "entry-week";
    week.textContent = entry.week;

    const del = document.createElement("button");
    del.className = "btn-delete";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteEntry(entry.id));

    headerRow.appendChild(week);
    headerRow.appendChild(del);

    // Description
    const desc = document.createElement("p");
    desc.className = "entry-description";
    desc.textContent = entry.description;

    // Files area
    const files = document.createElement("div");
    files.className = "entry-files";
    if (entry.files && entry.files.length) {
      entry.files.forEach((f) => files.appendChild(renderFile(f)));
    } else {
      files.classList.add("empty");
    }

    wrapper.appendChild(headerRow);
    wrapper.appendChild(desc);
    wrapper.appendChild(files);
    entriesEl.appendChild(wrapper);
  });
}

/* ---- Actions ---- */
function deleteEntry(id) {
  if (!confirm("Delete this entry?")) return;
  const entries = loadEntries().filter((e) => e.id !== id);
  saveEntries(entries);
  renderEntries();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const week = document.getElementById("week").value.trim();
  const description = document.getElementById("description").value.trim();
  const fileInput = document.getElementById("files");

  const files = [];
  for (const file of fileInput.files) {
    files.push({
      name: file.name,
      type: file.type,
      data: await readFileAsDataURL(file),
    });
  }

  const entries = loadEntries();
  entries.push({
    id: Date.now().toString(),
    week,
    description,
    files,
  });

  try {
    saveEntries(entries);
  } catch (err) {
    alert(
      "Could not save — the files may be too large for browser storage. Try smaller or fewer files."
    );
    return;
  }

  form.reset();
  renderEntries();
});

/* ---- Init ---- */
renderEntries();
