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

// Entries get opened with tabs.create() and rendered as links; restricting
// to http(s) keeps a malicious import (or a hand-edited entry) from storing
// a data:/javascript: URL that opens as a convincing fake page under a
// friendly, attacker-chosen title.
function isSafeUrl(url) {
  try {
    const scheme = new URL(url).protocol;
    return scheme === "http:" || scheme === "https:";
  } catch {
    return false;
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

// Single-line fields can come from an untrusted source (page meta tags via
// extract-meta.js, or a shared/imported JSON file) and could contain
// embedded newlines crafted to inject fake "## entry" blocks into the
// rendered markdown. Collapse them to one line so they can't break out of
// their own bullet. Not applied to annotation, which keeps its own
// multi-line structure - see escapeMarkdownStructure below.
function oneLine(s) {
  return String(s).replace(/[\r\n]+/g, " ").trim();
}

// annotation is the one field that keeps real newlines (a user's own
// multi-line note), but it can also arrive from an imported JSON file
// someone else authored (see importEntries below) - untrusted the same way
// a page's meta tags are. Rather than collapsing it like oneLine, neutralize
// just the constructs that could forge a fake entry or corrupt the file's
// structure: a line that reads as a heading ("## Fake Entry"), as the "---"
// divider renderMarkdown puts between real entries, or as a code-fence
// delimiter (an unterminated ``` would swallow every entry after it into
// one code block). A leading backslash escapes all three in CommonMark
// without visibly changing ordinary text.
function escapeMarkdownStructure(s) {
  return String(s)
    .split(/\r\n|\r|\n/)
    .map((line) => {
      if (/^\s*#{1,6}(\s|$)/.test(line)) return line.replace(/^(\s*)(#+)/, "$1\\$2");
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return line.replace(/^(\s*)/, "$1\\");
      if (/^\s*(`{3,}|~{3,})/.test(line)) return line.replace(/^(\s*)([`~]{3,})/, "$1\\$2");
      return line;
    })
    .join("\n");
}

// Explicit Unicode bidi-override/isolate characters (RLO/LRO/RLE/LRE/PDF and
// the isolate variants) can make displayed text - e.g. a saved title shown
// as clickable link text - visually lie about what it says, the same trick
// behind "Trojan Source" source-code attacks. Ordinary right-to-left text
// (Arabic, Hebrew, ...) relies on the implicit bidi algorithm rather than
// these override codepoints, so legitimate text is unaffected by removing
// them. Applied at the point an entry is saved/edited/imported (not just
// when rendering markdown) so it also protects the extension's own list
// view, which renders title as raw link text with no escaping of its own.
function stripBidiControls(s) {
  return String(s).replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
}

function sanitizeEntryFields(fields) {
  return {
    ...fields,
    title: fields.title !== undefined ? stripBidiControls(fields.title) : fields.title,
    author: fields.author !== undefined ? stripBidiControls(fields.author) : fields.author,
    date: fields.date !== undefined ? stripBidiControls(fields.date) : fields.date,
    annotation: fields.annotation !== undefined ? stripBidiControls(fields.annotation) : fields.annotation,
    categories: Array.isArray(fields.categories) ? fields.categories.map(stripBidiControls) : fields.categories
  };
}

function renderMarkdown(entries) {
  let md = "# Tab Tack\n\n";
  for (const e of entries) {
    md += `## ${oneLine(e.title || e.url)}\n`;
    md += `- **URL:** ${oneLine(e.url)}\n`;
    if (e.author) md += `- **Author:** ${oneLine(e.author)}\n`;
    if (e.date) md += `- **Date:** ${oneLine(e.date)}\n`;
    if (e.categories && e.categories.length) {
      md += `- **Category:** ${e.categories.map(oneLine).join(", ")}\n`;
    }
    md += `- **Saved:** ${oneLine(e.savedDisplay || e.saved)}\n`;
    if (e.annotation) md += `\n${escapeMarkdownStructure(e.annotation)}\n`;
    md += "\n---\n\n";
  }
  return md;
}

// Inverse of escapeMarkdownStructure's three cases, for parseMarkdownExport
// below - restores an annotation's original heading/divider/fence lines
// that were backslash-escaped on export, rather than leaving the backslash
// in on a round trip.
function unescapeMarkdownStructure(s) {
  return String(s)
    .split(/\r\n|\r|\n/)
    .map((line) => {
      if (/^\s*\\#{1,6}(\s|$)/.test(line)) return line.replace(/^(\s*)\\(#+)/, "$1$2");
      if (/^\s*\\(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return line.replace(/^(\s*)\\/, "$1");
      if (/^\s*\\(`{3,}|~{3,})/.test(line)) return line.replace(/^(\s*)\\([`~]{3,})/, "$1$2");
      return line;
    })
    .join("\n");
}

// Reconstructs entries from a tab-tack.md export's known structure (## Title
// heading, URL/Author/Date/Category/Saved bullets, free-text annotation,
// "---" separators between entries). The .md file is normally write-only
// from the extension's side - this is the one place that reads it back, for
// recovering a list when storage.sync is lost but an old export survived
// (see README's "If it's the other way around" section). Output matches the
// shape parseImportPayload()/importEntries() already accept, so recovery
// goes through the same Import path as a JSON file.
function parseMarkdownEntryBlock(block) {
  const lines = block.split("\n");
  const titleMatch = lines[0].match(/^##\s*(.*)$/);
  const title = titleMatch ? titleMatch[1].trim() : "";

  let url = "";
  let author = "";
  let date = "";
  let categories = [];
  let savedDisplay = "";
  let i = 1;

  for (; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = line.match(/^- \*\*URL:\*\*\s*(.*)$/))) { url = m[1].trim(); continue; }
    if ((m = line.match(/^- \*\*Author:\*\*\s*(.*)$/))) { author = m[1].trim(); continue; }
    if ((m = line.match(/^- \*\*Date:\*\*\s*(.*)$/))) { date = m[1].trim(); continue; }
    if ((m = line.match(/^- \*\*Category:\*\*\s*(.*)$/))) {
      categories = m[1].split(",").map((c) => c.trim()).filter(Boolean);
      continue;
    }
    if ((m = line.match(/^- \*\*Saved:\*\*\s*(.*)$/))) {
      savedDisplay = m[1].trim();
      i++;
      break;
    }
    break; // unrecognized line before "Saved:" - stop reading metadata
  }

  const rest = lines.slice(i);
  while (rest.length && rest[0].trim() === "") rest.shift();
  while (rest.length && rest[rest.length - 1].trim() === "") rest.pop();
  const annotation = unescapeMarkdownStructure(rest.join("\n"));

  const parsedDate = new Date(savedDisplay);
  const saved = Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();

  return { title, url, author, date, categories, annotation, saved, savedDisplay };
}

function parseMarkdownExport(text) {
  const body = String(text).replace(/^#\s*Tab Tack\s*\n+/, "");
  return body
    .split(/\n-{3,}\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map(parseMarkdownEntryBlock)
    .filter((e) => e.url);
}

async function writeMarkdownFile(entries) {
  const md = renderMarkdown(entries);
  const blob = new Blob([md], { type: "text/markdown" });
  const blobUrl = URL.createObjectURL(blob);
  const { filename = "tab-tack.md" } = await browser.storage.local.get("filename");

  const downloadId = await browser.downloads.download({
    url: blobUrl,
    filename,
    conflictAction: "overwrite",
    saveAs: false
  });

  await waitForDownloadComplete(downloadId);
  URL.revokeObjectURL(blobUrl);
}

// --- Export / import for manual sharing and backup ---------------------
//
// Exported as JSON (not markdown) so import can parse it back reliably.
// Dedup on import matches by normalizeUrl(e.url), not the entry's id -
// ids are randomly generated per install, so two people's copies of "the
// same" saved page never share one.

function buildExportPayload(entries) {
  return {
    format: "tab-tack-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: entries.map((e) => ({
      title: e.title || "",
      url: e.url,
      author: e.author || "",
      date: e.date || "",
      categories: e.categories || [],
      annotation: e.annotation || "",
      saved: e.saved || "",
      savedDisplay: e.savedDisplay || ""
    }))
  };
}

async function exportEntriesToFile(entries) {
  const payload = buildExportPayload(entries);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const blobUrl = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);

  const downloadId = await browser.downloads.download({
    url: blobUrl,
    filename: `tab-tack-export-${stamp}.json`,
    saveAs: true
  });

  await waitForDownloadComplete(downloadId);
  URL.revokeObjectURL(blobUrl);
}

function parseImportPayload(jsonText) {
  const data = JSON.parse(jsonText);
  const entries = Array.isArray(data) ? data : data.entries;
  if (!Array.isArray(entries)) throw new Error("Not a recognized Tab Tack export file.");
  return entries;
}

// Per-entry validation (as opposed to parseImportPayload's structural
// checks) lives here rather than in parseImportPayload so rejections can be
// counted and reported back to the user, instead of silently vanishing.
async function importEntries(parsedEntries) {
  const existing = await getAllEntries();
  const existingUrls = new Set(existing.map((e) => normalizeUrl(e.url)));

  let added = 0;
  let skipped = 0;
  let rejected = 0;
  const importedCategories = [];

  for (const e of parsedEntries) {
    if (!e || typeof e.url !== "string" || !isSafeUrl(e.url.trim())) {
      rejected++;
      continue;
    }

    const key = normalizeUrl(e.url);
    if (existingUrls.has(key)) {
      skipped++;
      continue;
    }
    existingUrls.add(key);

    const record = sanitizeEntryFields({
      title: e.title || "",
      url: e.url,
      author: e.author || "",
      date: e.date || "",
      categories: Array.isArray(e.categories) ? e.categories : [],
      annotation: e.annotation || "",
      saved: e.saved || new Date().toISOString(),
      savedDisplay: e.savedDisplay || new Date().toLocaleString()
    });
    await addEntryRecord(record);
    added++;
    importedCategories.push(...record.categories);
  }

  if (importedCategories.length > 0) {
    const known = await getCategories();
    await setCategories(mergeCategoryList(known, importedCategories));
  }

  return { added, skipped, rejected };
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
