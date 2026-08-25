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
  const updatedCategories = mergeCategoryList(knownCategories, categories);

  await browser.storage.local.set({ entries, categories: updatedCategories });

  await writeMarkdownFile(entries);

  status.textContent = "Saved!";
  setTimeout(() => window.close(), 500);
}
