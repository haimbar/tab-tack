let allEntries = []; // array of entry records, each with a stable .id
let masterCategories = [];
let editingId = null;

let sortKey = "saved"; // "saved" | "author"
let sortDir = "desc"; // "asc" | "desc"
let groupByCategory = false;

const URL_TRUNCATE_LENGTH = 60;

document.addEventListener("DOMContentLoaded", init);
document.getElementById("search").addEventListener("input", render);
document.getElementById("categoryFilter").addEventListener("change", render);
document.getElementById("selectAll").addEventListener("change", onSelectAllChanged);
document.getElementById("openSelected").addEventListener("click", openSelected);
document.getElementById("exportSelected").addEventListener("click", exportSelected);
document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});
document.getElementById("importFile").addEventListener("change", importFromFile);
document.getElementById("reexport").addEventListener("click", reexportMarkdown);
document.getElementById("thSaved").addEventListener("click", () => setSort("saved"));
document.getElementById("thAuthor").addEventListener("click", () => setSort("author"));
document.getElementById("thCategory").addEventListener("click", () => {
  groupByCategory = !groupByCategory;
  render();
});

// Refresh automatically when sync storage changes from elsewhere (e.g. an
// entry added or edited on another machine) while this page is open.
browser.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName !== "sync") return;
  if (editingId !== null) return; // don't yank the form out from under an in-progress edit
  reload().then(render);
});

async function init() {
  document.getElementById("version").textContent = `v${browser.runtime.getManifest().version}`;

  await migrateLegacyStorage();

  allEntries = await getAllEntries();
  masterCategories = await getCategories();

  refreshCategoryFilterOptions();
  render();
}

async function reload() {
  allEntries = await getAllEntries();
  masterCategories = await getCategories();
  refreshCategoryFilterOptions();
}

function refreshCategoryFilterOptions() {
  const catSelect = document.getElementById("categoryFilter");
  const current = catSelect.value;
  catSelect.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All categories";
  catSelect.appendChild(allOpt);
  for (const cat of masterCategories) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  }
  catSelect.value = current;
}

function setSort(key) {
  groupByCategory = false;
  if (sortKey === key) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDir = key === "saved" ? "desc" : "asc";
  }
  render();
}

function compareEntries(a, b) {
  let cmp = 0;

  if (sortKey === "author") {
    if (!a.author && b.author) return 1;
    if (a.author && !b.author) return -1;
    cmp = (a.author || "").localeCompare(b.author || "", undefined, { sensitivity: "base" });
  } else {
    // saved (ISO timestamps sort correctly as strings)
    cmp = (a.saved || "").localeCompare(b.saved || "");
  }

  return sortDir === "asc" ? cmp : -cmp;
}

function filteredEntries() {
  const search = document.getElementById("search").value.trim().toLowerCase();
  const catFilter = document.getElementById("categoryFilter").value.toLowerCase();

  return allEntries.filter((e) => {
    const haystack = `${e.title || ""} ${e.url || ""} ${e.author || ""} ${e.annotation || ""}`.toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (catFilter && !(e.categories || []).some((c) => c.toLowerCase() === catFilter)) return false;
    return true;
  });
}

function render() {
  const rowsContainer = document.getElementById("rows");
  rowsContainer.innerHTML = "";

  const filtered = filteredEntries();

  if (groupByCategory) {
    renderGrouped(filtered, rowsContainer);
  } else {
    const sorted = [...filtered].sort(compareEntries);
    for (const e of sorted) rowsContainer.appendChild(buildRowOrEdit(e));
  }

  const isEmpty = filtered.length === 0;
  document.getElementById("empty").style.display = isEmpty ? "block" : "none";
  document.getElementById("table").style.display = isEmpty ? "none" : "table";
  document.getElementById("count").textContent = `${filtered.length} of ${allEntries.length} shown`;
  document.getElementById("selectAll").checked = false;
  updateOpenSelectedState();
  updateHeaderIndicators();
}

function renderGrouped(filtered, rowsContainer) {
  const groups = new Map(); // lowercase key -> { label, entries: [] }
  for (const e of filtered) {
    const cats = e.categories && e.categories.length ? e.categories : ["Uncategorized"];
    for (const c of cats) {
      const key = c.toLowerCase();
      if (!groups.has(key)) groups.set(key, { label: c, entries: [] });
      groups.get(key).entries.push(e);
    }
  }

  const groupKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "uncategorized") return 1;
    if (b === "uncategorized") return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });

  for (const key of groupKeys) {
    const group = groups.get(key);
    rowsContainer.appendChild(buildGroupHeaderRow(group.label, group.entries.length));
    const sorted = [...group.entries].sort(compareEntries);
    for (const e of sorted) rowsContainer.appendChild(buildRowOrEdit(e));
  }
}

function buildRowOrEdit(entry) {
  return entry.id === editingId ? buildEditRow(entry) : buildRow(entry);
}

function buildGroupHeaderRow(label, count) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 7;
  td.className = "group-header";
  td.textContent = `${label} (${count})`;
  tr.appendChild(td);
  return tr;
}

function updateHeaderIndicators() {
  const thSaved = document.getElementById("thSaved");
  const thAuthor = document.getElementById("thAuthor");
  const thCategory = document.getElementById("thCategory");

  thSaved.querySelector(".sort-indicator").textContent =
    !groupByCategory && sortKey === "saved" ? (sortDir === "asc" ? "▲" : "▼") : "";
  thAuthor.querySelector(".sort-indicator").textContent =
    !groupByCategory && sortKey === "author" ? (sortDir === "asc" ? "▲" : "▼") : "";
  thCategory.querySelector(".sort-indicator").textContent = groupByCategory ? "▾ grouped" : "";

  thSaved.classList.toggle("active", !groupByCategory && sortKey === "saved");
  thAuthor.classList.toggle("active", !groupByCategory && sortKey === "author");
  thCategory.classList.toggle("active", groupByCategory);
}

function buildUrlDiv(url) {
  const urlDiv = document.createElement("div");
  urlDiv.className = "url";

  if (!url || url.length <= URL_TRUNCATE_LENGTH) {
    urlDiv.textContent = url || "";
    return urlDiv;
  }

  let expanded = false;
  const textSpan = document.createElement("span");
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "url-toggle";

  function render() {
    textSpan.textContent = expanded ? url : `${url.slice(0, URL_TRUNCATE_LENGTH)}…`;
    toggleBtn.textContent = expanded ? "−" : "+";
    toggleBtn.title = expanded ? "Show less" : "Show full URL";
  }
  render();

  toggleBtn.addEventListener("click", () => {
    expanded = !expanded;
    render();
  });

  urlDiv.appendChild(textSpan);
  urlDiv.appendChild(toggleBtn);
  return urlDiv;
}

function buildRow(e) {
  const tr = document.createElement("tr");

  const selectTd = document.createElement("td");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "row-select";
  checkbox.dataset.id = e.id;
  checkbox.addEventListener("change", updateOpenSelectedState);
  selectTd.appendChild(checkbox);
  tr.appendChild(selectTd);

  const titleTd = document.createElement("td");
  const link = document.createElement("a");
  link.className = "title-link";
  link.href = "#";
  link.textContent = e.title || e.url;
  link.addEventListener("click", (evt) => {
    evt.preventDefault();
    browser.tabs.create({ url: e.url });
  });
  titleTd.appendChild(link);
  titleTd.appendChild(buildUrlDiv(e.url));
  tr.appendChild(titleTd);

  const metaTd = document.createElement("td");
  metaTd.className = "meta";
  metaTd.textContent = [e.author, e.date].filter(Boolean).join(" · ");
  tr.appendChild(metaTd);

  const catTd = document.createElement("td");
  catTd.className = "categories";
  for (const c of e.categories || []) {
    const span = document.createElement("span");
    span.textContent = c;
    catTd.appendChild(span);
  }
  tr.appendChild(catTd);

  const noteTd = document.createElement("td");
  noteTd.className = "annotation";
  noteTd.textContent = e.annotation || "";
  tr.appendChild(noteTd);

  const savedTd = document.createElement("td");
  savedTd.className = "meta";
  savedTd.textContent = e.savedDisplay || e.saved || "";
  tr.appendChild(savedTd);

  const actionsTd = document.createElement("td");
  actionsTd.className = "actions";

  const editBtn = document.createElement("button");
  editBtn.className = "row-btn";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => {
    groupByCategory = false;
    editingId = e.id;
    render();
  });
  actionsTd.appendChild(editBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "row-btn danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => deleteEntry(e.id));
  actionsTd.appendChild(deleteBtn);

  tr.appendChild(actionsTd);

  return tr;
}

async function deleteEntry(id) {
  const e = allEntries.find((x) => x.id === id);
  if (!e) return;
  const label = e.title || e.url;
  if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;

  await removeEntryRecord(id);
  allEntries = allEntries.filter((x) => x.id !== id);
  if (editingId === id) editingId = null;

  await writeMarkdownFile(allEntries);
  render();
}

function buildEditRow(e) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 7;
  td.className = "edit-cell";

  const form = document.createElement("div");
  form.className = "edit-form";

  function field(label, id, value) {
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.setAttribute("for", id);
    lab.textContent = label;
    const input = document.createElement("input");
    input.type = "text";
    input.id = id;
    input.value = value || "";
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  }

  const titleField = field("Title", "editTitle", e.title);
  const urlField = field("URL", "editUrl", e.url);
  const authorField = field("Author", "editAuthor", e.author);
  const dateField = field("Publish date", "editDate", e.date);
  form.appendChild(titleField);
  form.appendChild(urlField);
  form.appendChild(authorField);
  form.appendChild(dateField);

  const catWrap = document.createElement("div");
  catWrap.className = "full";
  const catLabel = document.createElement("label");
  catLabel.textContent = "Categories";
  const catList = document.createElement("div");
  catList.id = "editCategoryList";
  renderEditCategoryCheckboxes(catList, e.categories || []);
  const newCat = document.createElement("input");
  newCat.type = "text";
  newCat.id = "editNewCategories";
  newCat.placeholder = "Add new (comma-separated)";
  newCat.style.marginTop = "4px";
  catWrap.appendChild(catLabel);
  catWrap.appendChild(catList);
  catWrap.appendChild(newCat);
  form.appendChild(catWrap);

  const noteWrap = document.createElement("div");
  noteWrap.className = "full";
  const noteLabel = document.createElement("label");
  noteLabel.setAttribute("for", "editAnnotation");
  noteLabel.textContent = "Your note";
  const noteInput = document.createElement("textarea");
  noteInput.id = "editAnnotation";
  noteInput.value = e.annotation || "";
  noteWrap.appendChild(noteLabel);
  noteWrap.appendChild(noteInput);
  form.appendChild(noteWrap);

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.id = "editSave";
  saveBtn.textContent = "Save changes";
  saveBtn.addEventListener("click", () => saveEdit(e.id));
  const cancelBtn = document.createElement("button");
  cancelBtn.id = "editCancel";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => {
    editingId = null;
    render();
  });
  const status = document.createElement("div");
  status.className = "edit-status";
  status.id = "editStatus";
  actionsWrap.appendChild(saveBtn);
  actionsWrap.appendChild(cancelBtn);
  actionsWrap.appendChild(status);
  form.appendChild(actionsWrap);

  td.appendChild(form);
  tr.appendChild(td);
  return tr;
}

function renderEditCategoryCheckboxes(container, selected) {
  container.innerHTML = "";
  const selectedLower = new Set(selected.map((c) => c.toLowerCase()));
  if (masterCategories.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No categories yet — add one below.";
    container.appendChild(empty);
    return;
  }
  for (const cat of masterCategories) {
    const row = document.createElement("div");
    row.className = "cat-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = cat;
    checkbox.id = "editCat-" + cat;
    checkbox.checked = selectedLower.has(cat.toLowerCase());

    const label = document.createElement("label");
    label.setAttribute("for", checkbox.id);
    label.textContent = cat;

    row.appendChild(checkbox);
    row.appendChild(label);
    container.appendChild(row);
  }
}

function collectEditCategories() {
  const checked = Array.from(
    document.querySelectorAll("#editCategoryList input[type=checkbox]:checked")
  ).map((cb) => cb.value);

  const typed = document
    .getElementById("editNewCategories")
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

async function saveEdit(id) {
  const title = document.getElementById("editTitle").value.trim();
  const url = document.getElementById("editUrl").value.trim();
  const author = document.getElementById("editAuthor").value.trim();
  const date = document.getElementById("editDate").value.trim();
  const categories = collectEditCategories();
  const annotation = document.getElementById("editAnnotation").value.trim();
  const status = document.getElementById("editStatus");

  if (!url) {
    status.textContent = "URL is required.";
    return;
  }

  if (!isSafeUrl(url)) {
    status.textContent = "Only http/https links are allowed.";
    return;
  }

  const duplicate = allEntries.some(
    (e) => e.id !== id && normalizeUrl(e.url) === normalizeUrl(url)
  );
  if (duplicate) {
    status.textContent = "Another saved entry already uses this URL.";
    return;
  }

  try {
    const updated = await updateEntryRecord(
      id,
      sanitizeEntryFields({ title, url, author, date, categories, annotation })
    );
    allEntries = allEntries.map((e) => (e.id === id ? updated : e));

    masterCategories = sortCategories(mergeCategoryList(masterCategories, updated.categories));
    await setCategories(masterCategories);

    await writeMarkdownFile(allEntries);

    refreshCategoryFilterOptions();
    editingId = null;
    render();
  } catch (err) {
    console.error(err);
    status.textContent = "Couldn't save — sync storage may be full.";
  }
}

function onSelectAllChanged(evt) {
  const checked = evt.target.checked;
  document.querySelectorAll(".row-select").forEach((cb) => (cb.checked = checked));
  updateOpenSelectedState();
}

function updateOpenSelectedState() {
  const anyChecked = document.querySelectorAll(".row-select:checked").length > 0;
  document.getElementById("openSelected").disabled = !anyChecked;
  document.getElementById("exportSelected").disabled = !anyChecked;
}

function selectedEntries() {
  const checked = Array.from(document.querySelectorAll(".row-select:checked"));
  const uniqueIds = new Set(checked.map((cb) => cb.dataset.id));
  return allEntries.filter((e) => uniqueIds.has(e.id));
}

function openSelected() {
  for (const entry of selectedEntries()) {
    if (entry.url) browser.tabs.create({ url: entry.url });
  }
}

async function exportSelected() {
  const btn = document.getElementById("exportSelected");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Exporting…";
  try {
    await exportEntriesToFile(selectedEntries());
    btn.textContent = "Exported!";
  } catch (err) {
    console.error(err);
    btn.textContent = "Export failed";
  } finally {
    setTimeout(() => {
      btn.textContent = originalLabel;
      updateOpenSelectedState();
    }, 1500);
  }
}

async function importFromFile(evt) {
  const file = evt.target.files[0];
  evt.target.value = ""; // allow re-selecting the same file later
  if (!file) return;

  const status = document.getElementById("importStatus");
  status.style.color = "#2f4b6e";
  status.textContent = "Importing…";

  try {
    const text = await file.text();
    const parsed = parseImportPayload(text);
    const { added, skipped, rejected } = await importEntries(parsed);

    await reload();
    render();
    await writeMarkdownFile(allEntries);

    let message = `Imported ${added}, skipped ${skipped} already saved`;
    if (rejected > 0) message += `, rejected ${rejected} (missing or unsafe URL)`;
    status.textContent = `${message}.`;
  } catch (err) {
    console.error(err);
    status.style.color = "#b3261e";
    status.textContent = "Import failed — not a valid Tab Tack export file.";
  }
}

async function reexportMarkdown() {
  const btn = document.getElementById("reexport");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Exporting…";
  try {
    await writeMarkdownFile(allEntries);
    btn.textContent = "Exported!";
  } catch (err) {
    console.error(err);
    btn.textContent = "Export failed";
  } finally {
    setTimeout(() => {
      btn.textContent = originalLabel;
      btn.disabled = false;
    }, 1500);
  }
}
