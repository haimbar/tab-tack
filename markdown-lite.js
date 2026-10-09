// Minimal markdown renderer, scoped to exactly what README.md uses
// (headings, bold, italic, inline code, fenced code blocks, links, bare
// URLs, bullet/numbered lists, pipe tables) - not a general-purpose parser.
// Used by help.html to render the bundled README.md as an in-extension
// Help page.
//
// Split into two layers on purpose:
//   - parseMarkdownBlocks()/parseInline(): pure functions, markdown text in,
//     a tree of plain objects out. No DOM involved, so this is the part
//     that's actually unit-tested (see test/support/load-markdown-lite.js).
//   - renderMarkdownBlocks()/renderInlineNodes(): build real DOM nodes via
//     createElement/textContent from that tree. Deliberately thin and
//     mechanical - this is what keeps the project's "no innerHTML with any
//     data, ever" property true (see README's Security section) even for a
//     page that renders a whole document's worth of formatted text.

const GITHUB_BLOB_BASE = "https://github.com/haimbar/tab-tack/blob/master/";

// Relative links (e.g. to ROADMAP.md or LICENSE) point at files that may
// not be bundled into the shipped package (ROADMAP.md deliberately isn't -
// see package.json's webExt.ignoreFiles) or would otherwise navigate the
// Help tab away to a raw text file with no way back. Rewriting them to the
// public GitHub blob URL keeps every link in the rendered page open
// sensibly in a new tab.
function resolveLinkHref(url) {
  return /^https?:\/\//.test(url) ? url : GITHUB_BLOB_BASE + url;
}

const INLINE_TOKEN_RE = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s<]+)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

function parseInline(raw) {
  const nodes = [];
  const re = new RegExp(INLINE_TOKEN_RE); // fresh lastIndex per call
  let lastIndex = 0;
  let m;
  while ((m = re.exec(raw))) {
    if (m.index > lastIndex) nodes.push({ type: "text", value: raw.slice(lastIndex, m.index) });
    const [full, code, linkText, linkUrl, bareUrl, bold, italic] = m;

    if (code !== undefined) {
      nodes.push({ type: "code", value: code });
    } else if (linkText !== undefined) {
      nodes.push({ type: "link", href: resolveLinkHref(linkUrl), children: parseInline(linkText) });
    } else if (bareUrl !== undefined) {
      // Trailing punctuation (a comma or period right after a URL in
      // running prose, with no space) is sentence punctuation, not part
      // of the link.
      const trailing = bareUrl.match(/[.,;:!?)]+$/);
      const url = trailing ? bareUrl.slice(0, -trailing[0].length) : bareUrl;
      nodes.push({ type: "link", href: url, children: [{ type: "text", value: url }] });
      if (trailing) nodes.push({ type: "text", value: trailing[0] });
    } else if (bold !== undefined) {
      nodes.push({ type: "bold", children: parseInline(bold) });
    } else if (italic !== undefined) {
      nodes.push({ type: "italic", children: parseInline(italic) });
    }

    lastIndex = m.index + full.length;
  }
  if (lastIndex < raw.length) nodes.push({ type: "text", value: raw.slice(lastIndex) });
  return nodes;
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isBlockStart(line) {
  return (
    /^#{1,6}\s/.test(line) ||
    /^```/.test(line) ||
    /^-\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^\s*\|/.test(line)
  );
}

function consumeListItems(lines, start, marker) {
  const items = [];
  let i = start;
  while (i < lines.length && marker.test(lines[i])) {
    let text = lines[i].replace(marker, "");
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      text += " " + lines[i].trim();
      i++;
    }
    items.push(text);
  }
  return { items, next: i };
}

function parseMarkdownBlocks(markdown) {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", lang, text: codeLines.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, inline: parseInline(heading[2]) });
      i++;
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const header = splitTableRow(line).map(parseInline);
      i += 2; // header + separator row
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(splitTableRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (/^-\s+/.test(line)) {
      const { items, next } = consumeListItems(lines, i, /^-\s+/);
      blocks.push({ type: "list", ordered: false, items: items.map(parseInline) });
      i = next;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const { items, next } = consumeListItems(lines, i, /^\d+\.\s+/);
      blocks.push({ type: "list", ordered: true, items: items.map(parseInline) });
      i = next;
      continue;
    }

    const buf = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", inline: parseInline(buf.join(" ")) });
  }

  return blocks;
}

function renderInlineNodes(nodes, parent) {
  for (const node of nodes) {
    if (node.type === "text") {
      parent.appendChild(document.createTextNode(node.value));
    } else if (node.type === "code") {
      const el = document.createElement("code");
      el.textContent = node.value;
      parent.appendChild(el);
    } else if (node.type === "link") {
      const a = document.createElement("a");
      a.href = node.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      renderInlineNodes(node.children, a);
      parent.appendChild(a);
    } else if (node.type === "bold") {
      const el = document.createElement("strong");
      renderInlineNodes(node.children, el);
      parent.appendChild(el);
    } else if (node.type === "italic") {
      const el = document.createElement("em");
      renderInlineNodes(node.children, el);
      parent.appendChild(el);
    }
  }
}

function renderMarkdownBlocks(blocks, container) {
  for (const block of blocks) {
    if (block.type === "heading") {
      const el = document.createElement(`h${block.level}`);
      renderInlineNodes(block.inline, el);
      container.appendChild(el);
    } else if (block.type === "paragraph") {
      const el = document.createElement("p");
      renderInlineNodes(block.inline, el);
      container.appendChild(el);
    } else if (block.type === "code") {
      const pre = document.createElement("pre");
      const codeEl = document.createElement("code");
      if (block.lang) codeEl.className = `language-${block.lang}`;
      codeEl.textContent = block.text;
      pre.appendChild(codeEl);
      container.appendChild(pre);
    } else if (block.type === "list") {
      const listEl = document.createElement(block.ordered ? "ol" : "ul");
      for (const itemInline of block.items) {
        const li = document.createElement("li");
        renderInlineNodes(itemInline, li);
        listEl.appendChild(li);
      }
      container.appendChild(listEl);
    } else if (block.type === "table") {
      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const cellInline of block.header) {
        const th = document.createElement("th");
        renderInlineNodes(cellInline, th);
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      for (const row of block.rows) {
        const tr = document.createElement("tr");
        for (const cellInline of row) {
          const td = document.createElement("td");
          renderInlineNodes(cellInline, td);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      container.appendChild(table);
    }
  }
}

function renderMarkdownInto(markdown, container) {
  renderMarkdownBlocks(parseMarkdownBlocks(markdown), container);
}
