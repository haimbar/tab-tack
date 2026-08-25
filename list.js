let allEntries = []; // index = stable position in the storage array

let sortKey = "saved"; // "saved" | "author"
let sortDir = "desc"; // "asc" | "desc"
let groupByCategory = false;

document.addEventListener("DOMContentLoaded", init);
document.getElementById("search").addEventListener("input", render);
document.getElementById("categoryFilter").addEventListener("change", render);
document.getElementById("selectAll").addEventListener("change", onSelectAllChanged);
document.getElementById("openSelected").addEventListener("click", openSelected);
document.getElementById("thSaved").addEventListener("click", () => setSort("saved"));
document.getElementById("thAuthor").addEventListener("click", () => setSort("author"));
document.getElementById("thCategory").addEventListener("click", () => {
  groupByCategory = !groupByCategory;
  render();
});

async function init() {
  const { entries = [], categories = [] } = await browser.storage.local.get(["entries", "categories"]);
  allEntries = entries;

  const catSelect = document.getElementById("categoryFilter");
  for (const cat of categories) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  }

  render();
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

function compareEntries(ai, bi) {
  const a = allEntries[ai];
  const b = allEntries[bi];
  let cmp = 0;

  if (sortKey === "author") {
    if (!a.author && b.author) return 1;
    if (a.author && !b.author) return -1;
    cmp = a.author.localeCompare(b.author, undefined, { sensitivity: "base" });
  } else {
    // saved (ISO timestamps sort correctly as strings)
    cmp = (a.saved || "").localeCompare(b.saved || "");
  }

  return sortDir === "asc" ? cmp : -cmp;
}

function filteredIndices() {
  const search = document.getElementById("search").value.trim().toLowerCase();
  const catFilter = document.getElementById("categoryFilter").value.toLowerCase();

  return allEntries
    .map((_, i) => i)
    .filter((i) => {
      const e = allEntries[i];
      const haystack = `${e.title || ""} ${e.url || ""} ${e.annotation || ""}`.toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (catFilter && !(e.categories || []).some((c) => c.toLowerCase() === catFilter)) return false;
      return true;
    });
}

function render() {
  const rowsContainer = document.getElementById("rows");
  rowsContainer.innerHTML = "";

  const filtered = filteredIndices();

  if (groupByCategory) {
    renderGrouped(filtered, rowsContainer);
  } else {
    const sorted = [...filtered].sort(compareEntries);
    for (const i of sorted) rowsContainer.appendChild(buildRow(i, allEntries[i]));
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
  const groups = new Map(); // lowercase key -> { label, indices: [] }
  for (const i of filtered) {
    const e = allEntries[i];
    const cats = e.categories && e.categories.length ? e.categories : ["Uncategorized"];
    for (const c of cats) {
      const key = c.toLowerCase();
      if (!groups.has(key)) groups.set(key, { label: c, indices: [] });
      groups.get(key).indices.push(i);
    }
  }

  const groupKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "uncategorized") return 1;
    if (b === "uncategorized") return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });

  for (const key of groupKeys) {
    const group = groups.get(key);
    rowsContainer.appendChild(buildGroupHeaderRow(group.label, group.indices.length));
    const sorted = [...group.indices].sort(compareEntries);
    for (const i of sorted) rowsContainer.appendChild(buildRow(i, allEntries[i]));
  }
}

function buildGroupHeaderRow(label, count) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 6;
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

function buildRow(index, e) {
  const tr = document.createElement("tr");

  const selectTd = document.createElement("td");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "row-select";
  checkbox.dataset.index = String(index);
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
  const urlDiv = document.createElement("div");
  urlDiv.className = "url";
  urlDiv.textContent = e.url;
  titleTd.appendChild(urlDiv);
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

  return tr;
}

function onSelectAllChanged(evt) {
  const checked = evt.target.checked;
  document.querySelectorAll(".row-select").forEach((cb) => (cb.checked = checked));
  updateOpenSelectedState();
}

function updateOpenSelectedState() {
  const anyChecked = document.querySelectorAll(".row-select:checked").length > 0;
  document.getElementById("openSelected").disabled = !anyChecked;
}

function openSelected() {
  const checked = Array.from(document.querySelectorAll(".row-select:checked"));
  const uniqueIndices = new Set(checked.map((cb) => Number(cb.dataset.index)));
  for (const i of uniqueIndices) {
    const entry = allEntries[i];
    if (entry && entry.url) browser.tabs.create({ url: entry.url });
  }
}
