#!/usr/bin/env node
"use strict";

// Recovery tool: rebuild a Tab Tack JSON import file from a generated
// tab-tack.md export, for when storage.sync is lost (e.g. after removing
// and reinstalling the extension - see README's "Cross-machine sync"
// caveat) but the markdown file itself survived. Kept and tracked as a
// maintained part of this repo, not a throwaway script - this is a real
// recurring recovery path, not a one-time fix.
//
// The extension itself now has the same recovery path built in (list.html's
// "Import from markdown..." button), so this script mainly matters when you
// have the .md file but not a working copy of the extension to open it
// with. Reuses common.js's parseMarkdownExport/buildExportPayload (via
// test/support/load-common.js's Node loader) rather than a second copy of
// the parsing logic, so the two stay in sync automatically.
//
// Usage: node scripts/md-to-import.js <input.md> [output.json]

const fs = require("node:fs");
const path = require("node:path");
const { loadCommon } = require("../test/support/load-common.js");

function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) {
    console.error("Usage: node scripts/md-to-import.js <input.md> [output.json]");
    process.exit(1);
  }

  const { ctx } = loadCommon();
  const text = fs.readFileSync(inputPath, "utf8");
  const entries = ctx.parseMarkdownExport(text);
  const payload = ctx.buildExportPayload(entries);

  const out = outputPath || path.join(path.dirname(inputPath), "tab-tack-recovered-import.json");
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`Parsed ${entries.length} entries from ${inputPath}`);
  console.log(`Wrote ${out}`);
  console.log(`Import it via Tab Tack's "View saved pages" -> Import... (or use the "Import from markdown..." button directly on the .md file)`);
}

main();
