document.addEventListener("DOMContentLoaded", async () => {
  const { filename = "tab-notes.md" } = await browser.storage.local.get("filename");
  document.getElementById("filename").value = filename;
});

document.getElementById("save").addEventListener("click", async () => {
  const filename = document.getElementById("filename").value.trim() || "tab-notes.md";
  await browser.storage.local.set({ filename });
  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
});
