document.addEventListener("DOMContentLoaded", init);
document.getElementById("save").addEventListener("click", saveEntry);
document.getElementById("viewSaved").addEventListener("click", async (e) => {
  e.preventDefault();
  const listUrl = browser.runtime.getURL("list.html");
  const [existing] = await browser.tabs.query({ url: listUrl });
  if (existing) {
    await browser.tabs.update(existing.id, { active: true });
    await browser.windows.update(existing.windowId, { focused: true });
  } else {
    await browser.tabs.create({ url: listUrl });
  }
  window.close();
});

async function init() {
  await migrateLegacyStorage();

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  document.getElementById("title").value = tab.title || "";
  document.getElementById("url").value = tab.url || "";

  const categories = await getCategories();
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

  if (!isSafeUrl(entry.url)) {
    status.style.color = "#b3261e";
    status.textContent = "Only http/https links can be saved.";
    return;
  }

  const entries = await getAllEntries();

  const duplicate = entries.some((e) => normalizeUrl(e.url) === normalizeUrl(entry.url));
  if (duplicate) {
    status.style.color = "#b3261e";
    status.textContent = "Already saved — this URL is already in your notes.";
    return;
  }
  status.style.color = "green";

  const saveButton = document.getElementById("save");
  saveButton.disabled = true;

  try {
    const record = await addEntryRecord(entry);
    entries.push(record);

    const knownCategories = await getCategories();
    await setCategories(mergeCategoryList(knownCategories, categories));

    await writeMarkdownFile(entries);

    status.style.color = "green";
    status.textContent = "Saved!";
    setTimeout(() => window.close(), 500);
  } catch (err) {
    console.error(err);
    status.style.color = "#b3261e";
    status.textContent = "Couldn't save — sync storage may be full (see Options).";
    saveButton.disabled = false;
  }
}
