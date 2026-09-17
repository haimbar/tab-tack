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

test("isSafeUrl", async (t) => {
  await t.test("accepts http and https", () => {
    const { ctx } = loadCommon();
    assert.equal(ctx.isSafeUrl("http://example.com"), true);
    assert.equal(ctx.isSafeUrl("https://example.com/page"), true);
  });

  await t.test("rejects data:, javascript:, and unparsable URLs", () => {
    const { ctx } = loadCommon();
    assert.equal(ctx.isSafeUrl("data:text/html,<script>alert(1)</script>"), false);
    assert.equal(ctx.isSafeUrl("javascript:alert(1)"), false);
    assert.equal(ctx.isSafeUrl("not a url"), false);
  });
});

test("escapeMarkdownStructure", async (t) => {
  await t.test("leaves ordinary multi-line text untouched", () => {
    const { ctx } = loadCommon();
    const note = "First line.\n\nSecond paragraph with more detail.";
    assert.equal(ctx.escapeMarkdownStructure(note), note);
  });

  await t.test("escapes a heading line so it can't forge a fake entry", () => {
    const { ctx } = loadCommon();
    const out = ctx.escapeMarkdownStructure("Nice note\n\n## Fake Entry\nmore text");
    assert.ok(!/^## Fake Entry$/m.test(out));
    assert.match(out, /\\## Fake Entry/);
  });

  await t.test("escapes a bare --- line so it can't fake the entry divider", () => {
    const { ctx } = loadCommon();
    const out = ctx.escapeMarkdownStructure("Nice note\n\n---\n\nmore text");
    assert.ok(!/^---$/m.test(out));
    assert.match(out, /\\---/);
  });

  await t.test("escapes a code-fence line so it can't swallow later entries", () => {
    const { ctx } = loadCommon();
    const out = ctx.escapeMarkdownStructure("Nice note\n\n```js\nmore text");
    assert.ok(!/^```/m.test(out));
    assert.match(out, /\\```js/);
  });

  await t.test("escapes a ~~~ fence too", () => {
    const { ctx } = loadCommon();
    const out = ctx.escapeMarkdownStructure("Nice note\n\n~~~\nmore text");
    assert.ok(!/^~~~/m.test(out));
    assert.match(out, /\\~~~/);
  });
});

test("stripBidiControls", async (t) => {
  await t.test("removes RTL-override characters used to spoof link text", () => {
    const { ctx } = loadCommon();
    assert.equal(ctx.stripBidiControls("safe\u202Eevil"), "safeevil");
  });

  await t.test("leaves ordinary text (including real RTL scripts) untouched", () => {
    const { ctx } = loadCommon();
    assert.equal(ctx.stripBidiControls("hello world"), "hello world");
    assert.equal(ctx.stripBidiControls("שלום עולם"), "שלום עולם");
  });
});

test("sanitizeEntryFields strips bidi controls from title/author/date/annotation/categories, leaves url alone", () => {
  const { ctx } = loadCommon();
  const cleaned = ctx.sanitizeEntryFields({
    title: "evil\u202Etitle",
    url: "https://example.com/\u202E",
    author: "evil\u202Eauthor",
    date: "evil\u202Edate",
    categories: ["evil\u202Ecat"],
    annotation: "evil\u202Eannotation"
  });
  assert.equal(cleaned.title, "eviltitle");
  assert.equal(cleaned.url, "https://example.com/\u202E");
  assert.equal(cleaned.author, "evilauthor");
  assert.equal(cleaned.date, "evildate");
  assert.deepEqual(cleaned.categories, ["evilcat"]);
  assert.equal(cleaned.annotation, "evilannotation");
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

  await t.test("neutralizes a fake entry forged through an imported annotation", () => {
    const { ctx } = loadCommon();
    const md = ctx.renderMarkdown([{
      title: "Real Page",
      url: "https://example.com/real",
      annotation: "Nice note\n\n---\n\n## Fake Entry\n- **URL:** https://evil.example/phish",
      saved: "2026-08-25T00:00:00.000Z"
    }]);
    assert.ok(!/^## Fake Entry$/m.test(md));
    assert.match(md, /Nice note\n\n\\---\n\n\\## Fake Entry/);
  });

  await t.test("neutralizes an unterminated code fence in an imported annotation", () => {
    const { ctx } = loadCommon();
    const md = ctx.renderMarkdown([{
      title: "Real Page",
      url: "https://example.com/real",
      annotation: "```\nlooks like code",
      saved: "2026-08-25T00:00:00.000Z"
    }]);
    assert.ok(!/^```/m.test(md));
    assert.match(md, /\\```\nlooks like code/);
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

  await t.test("drops entries with a non-http(s) url", () => {
    const { ctx } = loadCommon();
    const entries = ctx.parseImportPayload(
      JSON.stringify([
        { url: "https://a.com" },
        { url: "data:text/html,<script>alert(1)</script>" },
        { url: "javascript:alert(1)" }
      ])
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

test("importEntries strips bidi-override characters from the entry and from the category list", async () => {
  const { ctx } = loadCommon();

  await ctx.importEntries([
    { url: "https://a.com", title: "evil\u202Etitle", categories: ["evil\u202Ecat"] }
  ]);

  const [entry] = await ctx.getAllEntries();
  assert.equal(entry.title, "eviltitle");
  assert.deepEqual(entry.categories, ["evilcat"]);
  assert.deepEqual(await ctx.getCategories(), ["evilcat"]);
});
