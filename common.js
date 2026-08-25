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
