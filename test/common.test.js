"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCommon } = require("./support/load-common.js");

test("normalizeUrl", async (t) => {
  await t.test("lowercases and strips fragment + trailing slash", () => {
    const { ctx } = loadCommon();
    assert.equal(ctx.normalizeUrl("https://Example.com/Page/#frag"), "https://example.com/page");
  });

  await t.test("treats trailing-slash and no-trailing-slash as the same URL", () => {
    const { ctx } = loadCommon();
    assert.equal(ctx.normalizeUrl("https://example.com/a"), ctx.normalizeUrl("https://example.com/a/"));
  });

  await t.test("falls back to trimmed lowercase text for an unparsable URL", () => {
    const { ctx } = loadCommon();
    assert.equal(ctx.normalizeUrl("  Not A URL  "), "not a url");
  });
});

test("sortCategories is a case-insensitive locale sort", () => {
  const { ctx } = loadCommon();
  assert.deepEqual(ctx.sortCategories(["banana", "Apple", "cherry"]), ["Apple", "banana", "cherry"]);
});

test("mergeCategoryList dedups case-insensitively, keeping first-seen casing and order", () => {
  const { ctx } = loadCommon();
  const merged = ctx.mergeCategoryList(["Apple", "banana"], ["APPLE", "cherry", "Banana"]);
  assert.deepEqual(merged, ["Apple", "banana", "cherry"]);
});

test("oneLine collapses embedded newlines and trims", () => {
  const { ctx } = loadCommon();
  assert.equal(ctx.oneLine("Line1\nLine2\r\nLine3"), "Line1 Line2 Line3");
  assert.equal(ctx.oneLine("  padded  "), "padded");
});

test("renderMarkdown", async (t) => {
  await t.test("renders a basic entry", () => {
    const { ctx } = loadCommon();
    const md = ctx.renderMarkdown([{
      title: "Real Page",
      url: "https://example.com/real",
      author: "Jane Doe",
      date: "2026-08-20",
      categories: ["research"],
      saved: "2026-08-25T15:14:02.000Z",
      savedDisplay: "8/25/2026, 3:14:02 PM",
      annotation: "Worth revisiting."
    }]);
    assert.match(md, /^## Real Page$/m);
    assert.match(md, /- \*\*URL:\*\* https:\/\/example\.com\/real/);
    assert.match(md, /- \*\*Author:\*\* Jane Doe/);
    assert.match(md, /Worth revisiting\./);
  });

  await t.test("neutralizes a newline-injected fake entry from an untrusted meta tag", () => {
    const { ctx } = loadCommon();
    const md = ctx.renderMarkdown([{
      title: "Real Page",
      url: "https://example.com/real",
      author: "Evil\n\n---\n\n## Fake Entry\n- **URL:** https://evil.example/phish",
      saved: "2026-08-25T00:00:00.000Z"
    }]);
    // A heading only renders as a heading at the start of a line - so the
    // fix is verified by confirming the injected text never lands there.
    assert.ok(!md.includes("\n## Fake Entry"));
    assert.match(
      md,
      /- \*\*Author:\*\* Evil --- ## Fake Entry - \*\*URL:\*\* https:\/\/evil\.example\/phish/
    );
  });
});

test("buildExportPayload / parseImportPayload", async (t) => {
  await t.test("export payload has the expected shape and field defaults", () => {
    const { ctx } = loadCommon();
    const payload = ctx.buildExportPayload([{ url: "https://example.com" }]);
    assert.equal(payload.format, "tab-tack-export");
    assert.equal(payload.version, 1);
    assert.deepEqual(payload.entries, [{
      title: "", url: "https://example.com", author: "", date: "",
      categories: [], annotation: "", saved: "", savedDisplay: ""
    }]);
  });

  await t.test("parses the wrapped-object export format", () => {
    const { ctx } = loadCommon();
    const entries = ctx.parseImportPayload(JSON.stringify({ entries: [{ url: "https://a.com" }] }));
    assert.deepEqual(entries, [{ url: "https://a.com" }]);
  });

  await t.test("parses a bare array too", () => {
    const { ctx } = loadCommon();
    const entries = ctx.parseImportPayload(JSON.stringify([{ url: "https://a.com" }]));
    assert.deepEqual(entries, [{ url: "https://a.com" }]);
  });

  await t.test("rejects a file with no entries array", () => {
    const { ctx } = loadCommon();
    assert.throws(() => ctx.parseImportPayload(JSON.stringify({ foo: "bar" })));
  });

  await t.test("drops entries without a usable url", () => {
    const { ctx } = loadCommon();
    const entries = ctx.parseImportPayload(
      JSON.stringify([{ url: "https://a.com" }, { url: "" }, { title: "no url" }])
    );
    assert.deepEqual(entries, [{ url: "https://a.com" }]);
  });
});

test("sync storage CRUD", async (t) => {
  await t.test("addEntryRecord + getAllEntries round-trip in insertion order", async () => {
    const { ctx } = loadCommon();
    const a = await ctx.addEntryRecord({ url: "https://a.com", title: "A" });
    const b = await ctx.addEntryRecord({ url: "https://b.com", title: "B" });
    const all = await ctx.getAllEntries();
    assert.deepEqual(all.map((e) => e.title), ["A", "B"]);
    assert.notEqual(a.id, b.id);
  });

  await t.test("updateEntryRecord preserves id and untouched fields", async () => {
    const { ctx } = loadCommon();
    const a = await ctx.addEntryRecord({ url: "https://a.com", title: "A", author: "X" });
    const updated = await ctx.updateEntryRecord(a.id, { title: "A2" });
    assert.equal(updated.id, a.id);
    assert.equal(updated.title, "A2");
    assert.equal(updated.author, "X");
  });

  await t.test("removeEntryRecord removes it from getAllEntries", async () => {
    const { ctx } = loadCommon();
    const a = await ctx.addEntryRecord({ url: "https://a.com" });
    const b = await ctx.addEntryRecord({ url: "https://b.com" });
    await ctx.removeEntryRecord(a.id);
    const all = await ctx.getAllEntries();
    assert.deepEqual(all.map((e) => e.id), [b.id]);
  });

  await t.test("getCategories/setCategories round-trip, sorted", async () => {
    const { ctx } = loadCommon();
    await ctx.setCategories(["banana", "Apple"]);
    assert.deepEqual(await ctx.getCategories(), ["Apple", "banana"]);
  });
});

test("migrateLegacyStorage", async (t) => {
  await t.test("moves old storage.local entries/categories into storage.sync once", async () => {
    const { ctx, local } = loadCommon();
    await local.set({
      entries: [
        { url: "https://a.com", title: "A" },
        { id: "keep-me", url: "https://b.com", title: "B" }
      ],
      categories: ["legacy-cat"]
    });

    await ctx.migrateLegacyStorage();

    const all = await ctx.getAllEntries();
    assert.equal(all.length, 2);
    assert.ok(all.some((e) => e.id === "keep-me"));
    assert.deepEqual(await ctx.getCategories(), ["legacy-cat"]);
    assert.equal(local.dump().migratedToSync, true);
    assert.equal(local.dump().entries, undefined);
    assert.equal(local.dump().categories, undefined);
  });

  await t.test("is a no-op on a second call", async () => {
    const { ctx, local } = loadCommon();
    await local.set({ entries: [{ url: "https://a.com" }], categories: [] });
    await ctx.migrateLegacyStorage();
    const afterFirst = await ctx.getAllEntries();

    await ctx.migrateLegacyStorage();
    const afterSecond = await ctx.getAllEntries();

    assert.deepEqual(afterSecond, afterFirst);
  });
});

test("importEntries skips an already-saved URL, adds a new one, merges categories", async () => {
  const { ctx } = loadCommon();
  await ctx.addEntryRecord({ url: "https://a.com", title: "Existing" });

  const { added, skipped } = await ctx.importEntries([
    { url: "https://a.com", title: "Duplicate attempt" },
    { url: "https://c.com", title: "New", categories: ["fresh"] }
  ]);

  assert.equal(added, 1);
  assert.equal(skipped, 1);
  const all = await ctx.getAllEntries();
  assert.deepEqual(all.map((e) => e.url).sort(), ["https://a.com", "https://c.com"]);
  assert.deepEqual(await ctx.getCategories(), ["fresh"]);
});
