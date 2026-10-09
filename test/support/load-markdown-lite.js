"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Only the pure, DOM-independent half of markdown-lite.js is exposed here
// (parseMarkdownBlocks/parseInline/resolveLinkHref) - the rendering half
// (renderMarkdownBlocks/renderInlineNodes) calls document.createElement and
// has nothing worth unit-testing on its own (it's a thin, mechanical
// tree-to-DOM walk); it's exercised by hand in a real browser instead.
const EXPORTS = ["parseMarkdownBlocks", "parseInline", "resolveLinkHref"];

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "markdown-lite.js"), "utf8");

const loadMarkdownLiteImpl = vm.compileFunction(
  `${SOURCE}\nreturn { ${EXPORTS.join(", ")} };`,
  [],
  { filename: "markdown-lite.js" }
);

function loadMarkdownLite() {
  return loadMarkdownLiteImpl();
}

module.exports = { loadMarkdownLite };
