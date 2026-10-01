#!/usr/bin/env node
"use strict";

// Recovery tool: rebuild a Tab Tack JSON import file from a generated
// tab-tack.md export, for when storage.sync is lost (e.g. after removing
// and reinstalling the extension - see README's "Cross-machine sync"
// caveat) but the markdown file itself survived. Kept and tracked as a
// maintained part of this repo, not a throwaway script - this is a real
// recurring recovery path, not a one-time fix. The .md file is normally
// write-only from the extension's side; this is the one place that reads
// it back, run manually with Node (it's not something the extension
// itself loads or executes - a browser can't run this).
//
// Usage: node scripts/md-to-import.js <input.md> [output.json]

const fs = require("node:fs");
const path = require("node:path");

function parseEntryBlock(block) {
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
  const annotation = rest.join("\n");

  const parsedDate = new Date(savedDisplay);
  const saved = Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();

  return { title, url, author, date, categories, annotation, saved, savedDisplay };
}

function parseMarkdown(text) {
  const body = text.replace(/^#\s*Tab Tack\s*\n+/, "");
  return body
    .split(/\n-{3,}\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map(parseEntryBlock)
    .filter((e) => e.url);
}

function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) {
    console.error("Usage: node scripts/md-to-import.js <input.md> [output.json]");
    process.exit(1);
  }

  const text = fs.readFileSync(inputPath, "utf8");
  const entries = parseMarkdown(text);

  const payload = {
    format: "tab-tack-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries
  };

  const out = outputPath || path.join(path.dirname(inputPath), "tab-tack-recovered-import.json");
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`Parsed ${entries.length} entries from ${inputPath}`);
  console.log(`Wrote ${out}`);
  console.log(`Import it via Tab Tack's "View saved pages" -> Import...`);
}

main();
