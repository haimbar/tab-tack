document.addEventListener("DOMContentLoaded", init);

async function init() {
  document.getElementById("version").textContent = `v${browser.runtime.getManifest().version}`;

  try {
    const response = await fetch(browser.runtime.getURL("README.md"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();

    renderMarkdownInto(markdown, document.getElementById("content"));
    document.getElementById("loading").style.display = "none";
  } catch (err) {
    console.error("Failed to load README.md:", err);
    document.getElementById("loading").style.display = "none";
    document.getElementById("error").style.display = "block";
  }
}
