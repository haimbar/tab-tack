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

// --- Sync storage layer -----------------------------------------------
//
// Entries live in browser.storage.sync so they follow the user's browser
// account across machines. Each entry is stored under its own key
// (entry_<id>) rather than as one big array under a single key: sync
// storage caps a single item at 8KB, and one blob holding every entry
// would hit that ceiling after only a few dozen saves. Splitting per
// entry raises the practical ceiling to roughly however many entries fit
// in the ~100KB total sync quota.

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

async function getAllEntries() {
  const { entryIds = [] } = await browser.storage.sync.get("entryIds");
  if (entryIds.length === 0) return [];
  const keys = entryIds.map((id) => `entry_${id}`);
  const result = await browser.storage.sync.get(keys);
  return entryIds.map((id) => result[`entry_${id}`]).filter(Boolean);
}

function sortCategories(categories) {
  return [...categories].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function getCategories() {
  const { categories = [] } = await browser.storage.sync.get("categories");
  return sortCategories(categories);
}

async function setCategories(categories) {
  await browser.storage.sync.set({ categories });
}

async function addEntryRecord(fields) {
  const id = generateId();
  const record = { ...fields, id };
  const { entryIds = [] } = await browser.storage.sync.get("entryIds");
  await browser.storage.sync.set({ [`entry_${id}`]: record, entryIds: [...entryIds, id] });
  return record;
}

async function updateEntryRecord(id, fields) {
  const key = `entry_${id}`;
  const { [key]: existing } = await browser.storage.sync.get(key);
  const updated = { ...existing, ...fields, id };
  await browser.storage.sync.set({ [key]: updated });
  return updated;
}

async function removeEntryRecord(id) {
  const { entryIds = [] } = await browser.storage.sync.get("entryIds");
  await browser.storage.sync.remove(`entry_${id}`);
  await browser.storage.sync.set({ entryIds: entryIds.filter((x) => x !== id) });
}

// One-time move from the old storage.local single-array format to the
// per-entry storage.sync format. Safe to call on every page load — it
// no-ops once storage.local.migratedToSync is set.
async function migrateLegacyStorage() {
  const { migratedToSync } = await browser.storage.local.get("migratedToSync");
  if (migratedToSync) return;

  const { entries: legacyEntries = [], categories: legacyCategories = [] } =
    await browser.storage.local.get(["entries", "categories"]);

  if (legacyEntries.length > 0) {
    const entryIds = [];
    const toStore = {};
    for (const entry of legacyEntries) {
      const id = entry.id || generateId();
      entryIds.push(id);
      toStore[`entry_${id}`] = { ...entry, id };
    }
    toStore.entryIds = entryIds;
    await browser.storage.sync.set(toStore);
  }

  if (legacyCategories.length > 0) {
    const existing = await getCategories();
    await setCategories(mergeCategoryList(existing, legacyCategories));
  }

  await browser.storage.local.set({ migratedToSync: true });
  await browser.storage.local.remove(["entries", "categories"]);
}

function mergeCategoryList(known, additions) {
  const knownLower = new Set(known.map((c) => c.toLowerCase()));
  const merged = [...known];
  for (const cat of additions) {
    if (!knownLower.has(cat.toLowerCase())) {
      merged.push(cat);
      knownLower.add(cat.toLowerCase());
    }
  }
  return merged;
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
