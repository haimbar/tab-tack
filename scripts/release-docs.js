#!/usr/bin/env node
// Assembles docs/install.html, docs/tab-tack-<version>.xpi, and
// docs/tab-tack-<version>-source.zip from the current manifest version and
// the artifacts `npm run build` / `npm run sign` already produced.
//
// Usage: npm run build && AMO_API_KEY=... AMO_API_SECRET=... npm run sign && npm run release:docs

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const artifactsDir = path.join(root, "web-ext-artifacts");
const docsDir = path.join(root, "docs");

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const version = manifest.version;

function findArtifact(suffix, hint) {
  const match = fs.readdirSync(artifactsDir).find((f) => f.endsWith(suffix));
  if (!match) {
    console.error(`Could not find an artifact ending in "${suffix}" in web-ext-artifacts/.\n${hint}`);
    process.exit(1);
  }
  return path.join(artifactsDir, match);
}

const zipSrc = findArtifact(`-${version}.zip`, "Run `npm run build` first.");
const xpiSrc = findArtifact(`-${version}.xpi`, "Run `npm run sign` first (requires AMO_API_KEY / AMO_API_SECRET).");

const xpiName = `tab-tack-${version}.xpi`;
const zipName = `tab-tack-${version}-source.zip`;

// Remove previous versions' downloadable files so docs/ doesn't accumulate stale builds.
for (const f of fs.readdirSync(docsDir)) {
  if (/^tab-tack-.*\.(xpi|zip)$/.test(f) && f !== xpiName && f !== zipName) {
    fs.unlinkSync(path.join(docsDir, f));
  }
}

fs.copyFileSync(xpiSrc, path.join(docsDir, xpiName));
fs.copyFileSync(zipSrc, path.join(docsDir, zipName));

const template = fs.readFileSync(path.join(docsDir, "install.template.html"), "utf8");
const page = template
  .replaceAll("{{VERSION}}", version)
  .replaceAll("{{XPI_NAME}}", xpiName)
  .replaceAll("{{ZIP_NAME}}", zipName);

fs.writeFileSync(path.join(docsDir, "install.html"), page);

console.log(`docs/install.html, docs/${xpiName}, docs/${zipName} written for v${version}.`);
