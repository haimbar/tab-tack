"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// A minimal in-memory stand-in for one browser.storage area (sync or
// local), matching the get/set/remove call shapes common.js actually uses
// (a single string key, or an array of string keys - never the
// object-with-defaults form, but it's handled too for safety).
function createMockStorageArea() {
  const store = {};
  return {
    async get(keys) {
      if (keys == null) return { ...store };
      if (typeof keys === "string") return { [keys]: store[keys] };
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) out[k] = store[k];
        return out;
      }
      const out = {};
      for (const k of Object.keys(keys)) out[k] = k in store ? store[k] : keys[k];
      return out;
    },
    async set(updates) {
      Object.assign(store, updates);
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
    },
    dump() {
      return { ...store };
    }
  };
}

// Every top-level function declaration in common.js, so a fresh call to it
// (below) can hand them all back as one object.
const EXPORTS = [
  "normalizeUrl", "isSafeUrl", "generateId", "getAllEntries", "sortCategories",
  "getCategories", "setCategories", "addEntryRecord", "updateEntryRecord",
  "removeEntryRecord", "migrateLegacyStorage", "mergeCategoryList",
  "renderMarkdown", "writeMarkdownFile", "buildExportPayload",
  "exportEntriesToFile", "parseImportPayload", "importEntries",
  "waitForDownloadComplete", "oneLine", "escapeMarkdownStructure"
];

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "common.js"), "utf8");

// vm.compileFunction wraps common.js's source as the body of a function
// taking `browser` as a parameter, compiled in the *same* realm as this
// test file (unlike vm.createContext, which makes a separate realm with
// its own Array/Object - deepStrictEqual then sees "same structure but
// not reference-equal" for cross-realm objects, which is exactly the
// failure this sidesteps). Appending a `return {...}` exposes the
// top-level function declarations without turning the file shipped to
// the browser into a CommonJS module just for testing.
const loadCommonImpl = vm.compileFunction(
  `${SOURCE}\nreturn { ${EXPORTS.join(", ")} };`,
  ["browser"],
  { filename: "common.js" }
);

// Runs common.js fresh per call, so tests get isolated storage and direct
// access to its functions (normalizeUrl, addEntryRecord, renderMarkdown,
// ...) via the returned `ctx`.
//
// Scope: only common.js is covered here. popup.js/list.js/options.js are
// DOM-rendering glue that would need a real DOM environment to test
// meaningfully; writeMarkdownFile/exportEntriesToFile/
// waitForDownloadComplete are thin wrappers over browser.downloads/Blob
// with little logic of their own, so they're left untested rather than
// mocked just to exercise the mock.
function loadCommon() {
  const sync = createMockStorageArea();
  const local = createMockStorageArea();
  const browser = { storage: { sync, local } };

  const ctx = loadCommonImpl(browser);

  return { ctx, sync, local };
}

module.exports = { loadCommon };
