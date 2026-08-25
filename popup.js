document.addEventListener("DOMContentLoaded", init);
document.getElementById("save").addEventListener("click", saveEntry);
document.getElementById("viewSaved").addEventListener("click", (e) => {
  e.preventDefault();
  browser.tabs.create({ url: browser.runtime.getURL("list.html") });
});

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  document.getElementById("title").value = tab.title || "";
  document.getElementById("url").value = tab.url || "";

  const { categories = [] } = await browser.storage.local.get("categories");
  renderCategoryCheckboxes(categories);

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["extract-meta.js"]
    });
    const data = results && results[0] && results[0].result;
    if (data) {
      if (data.author) document.getElementById("author").value = data.author;
      if (data.date) document.getElementById("date").value = data.date;
    }
  } catch (e) {
    // Some pages (about:, addons.mozilla.org, PDFs) block content scripts; ignore.
    console.warn("Meta extraction skipped:", e);
  }
}

function renderCategoryCheckboxes(categories) {
  const container = document.getElementById("categoryList");
  container.innerHTML = "";
  if (categories.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No categories yet — add one below.";
    container.appendChild(empty);
    return;
  }
  for (const cat of categories) {
    const row = document.createElement("div");
    row.className = "cat-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = cat;
    checkbox.id = "cat-" + cat;

    const label = document.createElement("label");
    label.setAttribute("for", checkbox.id);
    label.textContent = cat;

    row.appendChild(checkbox);
    row.appendChild(label);
    container.appendChild(row);
  }
}

function collectSelectedCategories() {
  const checked = Array.from(
    document.querySelectorAll("#categoryList input[type=checkbox]:checked")
  ).map((cb) => cb.value);

  const typed = document
    .getElementById("newCategories")
    .value.split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const merged = [];
  const seen = new Set();
  for (const cat of [...checked, ...typed]) {
    const key = cat.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(cat);
    }
  }
  return merged;
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

async function saveEntry() {
  const now = new Date();
  const categories = collectSelectedCategories();
  const entry = {
    title: document.getElementById("title").value.trim(),
    url: document.getElementById("url").value.trim(),
    author: document.getElementById("author").value.trim(),
    date: document.getElementById("date").value.trim(),
    categories,
    annotation: document.getElementById("annotation").value.trim(),
    saved: now.toISOString(),
    savedDisplay: now.toLocaleString()
  };

  if (!entry.url) return;

  const status = document.getElementById("status");
  const { entries = [] } = await browser.storage.local.get("entries");

  const duplicate = entries.some((e) => normalizeUrl(e.url) === normalizeUrl(entry.url));
  if (duplicate) {
    status.style.color = "#b3261e";
    status.textContent = "Already saved — this URL is already in your notes.";
    return;
  }
  status.style.color = "green";

  const saveButton = document.getElementById("save");
  saveButton.disabled = true;

  entries.push(entry);

  const { categories: knownCategories = [] } = await browser.storage.local.get("categories");
  const knownLower = new Set(knownCategories.map((c) => c.toLowerCase()));
  const updatedCategories = [...knownCategories];
  for (const cat of categories) {
    if (!knownLower.has(cat.toLowerCase())) {
      updatedCategories.push(cat);
      knownLower.add(cat.toLowerCase());
    }
  }

  await browser.storage.local.set({ entries, categories: updatedCategories });

  await writeMarkdownFile(entries);

  status.textContent = "Saved!";
  setTimeout(() => window.close(), 500);
}

function renderMarkdown(entries) {
  let md = "# Tab Notes\n\n";
  for (const e of entries) {
    md += `## ${e.title || e.url}\n`;
    md += `- **URL:** ${e.url}\n`;
    if (e.author) md += `- **Author:** ${e.author}\n`;
    if (e.date) md += `- **Date:** ${e.date}\n`;
    if (e.categories && e.categories.length) md += `- **Category:** ${e.categories.join(", ")}\n`;
    md += `- **Saved:** ${e.savedDisplay || e.saved}\n`;
    if (e.annotation) md += `\n${e.annotation}\n`;
    md += "\n---\n\n";
  }
  return md;
}

async function writeMarkdownFile(entries) {
  const md = renderMarkdown(entries);
  const blob = new Blob([md], { type: "text/markdown" });
  const blobUrl = URL.createObjectURL(blob);
  const { filename = "tab-notes.md" } = await browser.storage.local.get("filename");

  const downloadId = await browser.downloads.download({
    url: blobUrl,
    filename,
    conflictAction: "overwrite",
    saveAs: false
  });

  await waitForDownloadComplete(downloadId);
  URL.revokeObjectURL(blobUrl);
}

function waitForDownloadComplete(downloadId) {
  return new Promise((resolve) => {
    function listener(delta) {
      if (delta.id === downloadId && delta.state &&
          (delta.state.current === "complete" || delta.state.current === "interrupted")) {
        browser.downloads.onChanged.removeListener(listener);
        resolve();
      }
    }
    browser.downloads.onChanged.addListener(listener);
    setTimeout(resolve, 3000); // safety fallback
  });
}
