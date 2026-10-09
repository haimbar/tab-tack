"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadMarkdownLite } = require("./support/load-markdown-lite.js");

test("resolveLinkHref", async (t) => {
  await t.test("leaves http(s) URLs untouched", () => {
    const { resolveLinkHref } = loadMarkdownLite();
    assert.equal(resolveLinkHref("https://example.com"), "https://example.com");
    assert.equal(resolveLinkHref("http://example.com"), "http://example.com");
  });

  await t.test("rewrites a relative path to the GitHub blob URL", () => {
    const { resolveLinkHref } = loadMarkdownLite();
    assert.equal(
      resolveLinkHref("ROADMAP.md"),
      "https://github.com/haimbar/tab-tack/blob/master/ROADMAP.md"
    );
  });
});

test("parseInline", async (t) => {
  await t.test("plain text with no markup", () => {
    const { parseInline } = loadMarkdownLite();
    assert.deepEqual(parseInline("hello world"), [{ type: "text", value: "hello world" }]);
  });

  await t.test("bold, italic, and code spans", () => {
    const { parseInline } = loadMarkdownLite();
    assert.deepEqual(parseInline("**bold**"), [
      { type: "bold", children: [{ type: "text", value: "bold" }] }
    ]);
    assert.deepEqual(parseInline("*italic*"), [
      { type: "italic", children: [{ type: "text", value: "italic" }] }
    ]);
    assert.deepEqual(parseInline("`code`"), [{ type: "code", value: "code" }]);
  });

  await t.test("a markdown link with plain text", () => {
    const { parseInline } = loadMarkdownLite();
    assert.deepEqual(parseInline("[text](https://example.com)"), [
      { type: "link", href: "https://example.com", children: [{ type: "text", value: "text" }] }
    ]);
  });

  await t.test("a markdown link whose text contains a code span", () => {
    const { parseInline } = loadMarkdownLite();
    assert.deepEqual(parseInline("[Mozilla's `webextension-polyfill`](https://x.com)"), [{
      type: "link",
      href: "https://x.com",
      children: [
        { type: "text", value: "Mozilla's " },
        { type: "code", value: "webextension-polyfill" }
      ]
    }]);
  });

  await t.test("a relative-path link is rewritten to the GitHub blob URL", () => {
    const { parseInline } = loadMarkdownLite();
    const [node] = parseInline("[ROADMAP.md](ROADMAP.md)");
    assert.equal(node.href, "https://github.com/haimbar/tab-tack/blob/master/ROADMAP.md");
  });

  await t.test("a bare URL is auto-linked", () => {
    const { parseInline } = loadMarkdownLite();
    assert.deepEqual(parseInline("see https://example.com for more"), [
      { type: "text", value: "see " },
      { type: "link", href: "https://example.com", children: [{ type: "text", value: "https://example.com" }] },
      { type: "text", value: " for more" }
    ]);
  });

  await t.test("trailing punctuation on a bare URL is not swept into the link", () => {
    const { parseInline } = loadMarkdownLite();
    const nodes = parseInline("visit https://example.com/key/, then continue");
    const link = nodes.find((n) => n.type === "link");
    assert.equal(link.href, "https://example.com/key/");
    assert.ok(nodes.some((n) => n.type === "text" && n.value.startsWith(",")));
  });

  await t.test("text containing angle brackets is kept as a plain text value (no HTML escaping needed at this layer)", () => {
    const { parseInline } = loadMarkdownLite();
    assert.deepEqual(parseInline("no `<all_urls>` or other permission"), [
      { type: "text", value: "no " },
      { type: "code", value: "<all_urls>" },
      { type: "text", value: " or other permission" }
    ]);
  });
});

test("parseMarkdownBlocks", async (t) => {
  await t.test("headings at every level used (1-3)", () => {
    const { parseMarkdownBlocks } = loadMarkdownLite();
    const blocks = parseMarkdownBlocks("# One\n\n## Two\n\n### Three\n");
    assert.deepEqual(blocks.map((b) => [b.type, b.level]), [
      ["heading", 1], ["heading", 2], ["heading", 3]
    ]);
  });

  await t.test("a paragraph joins soft-wrapped lines with a space", () => {
    const { parseMarkdownBlocks } = loadMarkdownLite();
    const [block] = parseMarkdownBlocks("First line\nsecond line\nthird line.\n");
    assert.equal(block.type, "paragraph");
    assert.deepEqual(block.inline, [{ type: "text", value: "First line second line third line." }]);
  });

  await t.test("a fenced code block keeps its content literal, not parsed as markdown", () => {
    const { parseMarkdownBlocks } = loadMarkdownLite();
    const [block] = parseMarkdownBlocks("```markdown\n## Not a real heading\n- **not** bold either\n```\n");
    assert.equal(block.type, "code");
    assert.equal(block.lang, "markdown");
    assert.equal(block.text, "## Not a real heading\n- **not** bold either");
  });

  await t.test("a fenced code block with no language tag", () => {
    const { parseMarkdownBlocks } = loadMarkdownLite();
    const [block] = parseMarkdownBlocks("```\nplain\n```\n");
    assert.equal(block.lang, "");
  });

  await t.test("an unordered list joins each item's soft-wrapped continuation lines", () => {
    const { parseMarkdownBlocks } = loadMarkdownLite();
    const [block] = parseMarkdownBlocks("- First item\n  continues here.\n- Second item\n");
    assert.equal(block.type, "list");
    assert.equal(block.ordered, false);
    assert.equal(block.items.length, 2);
    assert.deepEqual(block.items[0], [{ type: "text", value: "First item continues here." }]);
  });

  await t.test("an ordered list", () => {
    const { parseMarkdownBlocks } = loadMarkdownLite();
    const [block] = parseMarkdownBlocks("1. Open the thing.\n2. Click the button.\n");
    assert.equal(block.type, "list");
    assert.equal(block.ordered, true);
    assert.equal(block.items.length, 2);
  });

  await t.test("a pipe table with header and separator row", () => {
    const { parseMarkdownBlocks } = loadMarkdownLite();
    const md = "| Browser | Status |\n|---|---|\n| Firefox | Supported |\n| Chrome | Supported |\n";
    const [block] = parseMarkdownBlocks(md);
    assert.equal(block.type, "table");
    assert.deepEqual(block.header.map((cell) => cell[0].value), ["Browser", "Status"]);
    assert.equal(block.rows.length, 2);
    assert.deepEqual(block.rows[0].map((cell) => cell[0].value), ["Firefox", "Supported"]);
  });

  await t.test("blank lines separate blocks rather than merging them", () => {
    const { parseMarkdownBlocks } = loadMarkdownLite();
    const blocks = parseMarkdownBlocks("First paragraph.\n\nSecond paragraph.\n");
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].inline[0].value, "First paragraph.");
    assert.equal(blocks[1].inline[0].value, "Second paragraph.");
  });
});
