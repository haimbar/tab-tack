# Tab Tack

A small browser extension. Click the toolbar button on any page to save its
title, URL, (auto-detected) author/date, the time you saved it, and your own
typed annotation as a new entry in a markdown file.

This same document is also available from inside the extension — click
**Help** in the toolbar popup or at the top-right of **View saved pages**
— so it's there without needing to find this repo again.

## Supported browsers

| Browser | Status |
|---|---|
| Firefox | Fully supported (original target) |
| Chrome | Supported |
| Edge | Supported (Chromium-based — see note below) |
| Brave, Opera, Vivaldi, and other Chromium browsers | Expected to work, not individually tested |
| Safari | Not supported — different distribution model (Xcode/App Store); tracked in [ROADMAP.md](ROADMAP.md) |

The extension uses [Mozilla's `webextension-polyfill`](https://github.com/mozilla/webextension-polyfill)
(vendored in `vendor/`) so the same code runs unchanged on both the native
Firefox `browser.*` API and Chrome's `chrome.*` API. Edge, Brave, Opera, and
Vivaldi all use Chromium's extension engine, so a Chrome-compatible
extension is expected to load the same way on them via their own
`chrome://extensions`-equivalent page (`edge://extensions`, etc.) — this
hasn't been individually verified on each, but there's no Chrome-specific
code here that would behave differently on one Chromium browser vs.
another.

Firefox installs require Firefox 140 or later (`strict_min_version` in
`manifest.json`) — that's the version that added the
`data_collection_permissions` manifest field this extension declares.
Chrome/Edge have no equivalent version pin; any browser current enough to
support Manifest V3 extensions works.

## How it works

- Click the toolbar icon → a popup shows the page's title and URL (pre-filled),
  an author/date field (auto-filled from the page's meta tags when present),
  a category picker, and a text box for your own note.
- Categories: check any existing ones from the list, and/or type new ones
  (comma-separated) in the box below it. Anything new you type is remembered
  for next time, so your category list grows as you use it.
- Click **Save to markdown file**. The entry is appended to an internal list
  (kept in the extension's synced storage — see **Cross-machine sync**
  below) and the *entire* file is re-written to your Downloads folder,
  overwriting the previous version.
- Default output file: `Downloads/tab-tack.md`. Change the filename (or use
  a subfolder, e.g. `notes/tab-tack.md`) via the extension's Options page
  (right-click the toolbar icon → Manage Extension → Preferences).

Each entry looks like:

```markdown
## Page Title
- **URL:** https://example.com/article
- **Author:** Jane Doe
- **Date:** 2026-08-20
- **Category:** research, firefox
- **Saved:** 8/25/2026, 3:14:02 PM

Your annotation goes here.

---
```

Author/date are omitted when the page doesn't expose them (most pages don't
set that metadata, so blank is normal — not a bug).

Saving a URL that's already in your notes is blocked — the popup shows
"Already saved" instead of writing a second copy. Duplicates are detected by
URL (ignoring the `#fragment` and a trailing slash), not by title.

## Browsing and reopening saved pages

Click **View saved pages →** at the bottom of the popup to open a full-page
list of everything you've saved (newest first). From there you can:

- Search by title, URL, author, or note text.
- Filter by category.
- Click a title to open just that one page in a new tab.
- Check several rows and click **Open selected in new tabs** to reopen a
  chosen subset — unlike a bookmarks folder's "open all", nothing opens
  unless you've explicitly selected it.
- Click **Saved** or **Author / Date** column headers to sort by that field
  (click again to reverse direction).
- Click **Category** to switch into grouped view instead of sorting: entries
  are bucketed under each category as a section header, and since an item
  can belong to more than one category, it appears once per matching group
  (not just once overall). Items with no category land in an "Uncategorized"
  group. Click it again to return to the flat sorted list.
- **Download markdown file** rewrites the `.md` file immediately from
  what's currently saved — useful if the file was deleted or moved; see
  below.

This list is read from the extension's own synced storage (the same data
used to generate the markdown file), not from the `.md` file itself — so it
stays current even before you've saved a new entry, and reflects entries
saved from other synced machines too (see **Cross-machine sync** below).

## Editing and deleting saved entries

Each row has **Edit** and **Delete** buttons.

- **Edit** turns the row into a form (title, URL, author, date, categories,
  note) in place. Save re-checks for URL duplicates against your other
  entries, updates storage, and re-writes the markdown file. Cancel discards
  the changes.
- **Delete** asks for confirmation, then removes the entry from storage and
  re-writes the markdown file — the file no longer contains that entry.

Both actions write straight to the extension's storage and the markdown
file; there's no separate "unsaved changes" state to lose track of.

## Export / import

Check the boxes on the entries you want (same checkboxes used for "Open
selected in new tabs"), then **Export selected as JSON…** to save them as a JSON
file — a native Save dialog lets you pick where, so you can attach it to
an email or message. **Import…** loads a JSON file back in; entries whose
URL you already have are skipped automatically, so importing the same
file twice (or a file with some overlap) never creates duplicates.

Two things this is good for:
- **Sharing a subset of your list with someone else** who's also running
  Tab Tack — they get an Import button on their end, same as you.
- **Backup/restore**, independent of `storage.sync` — see the temporary-add-on
  caveat below. Export "select all" periodically and keep the file
  somewhere safe; Import brings everything back on a fresh install.

**Make exporting a habit, not a one-time thing.** `storage.sync` and the
`.md` file each cover different failure modes (see **Cross-machine
sync** and the "if the markdown file gets deleted" section below), but
neither is a substitute for an actual backup you control the location
of. Periodically click **Export selected as JSON…** with everything
selected, and keep the resulting file somewhere outside the browser
entirely — a cloud-synced folder, an email to yourself, a USB drive.
It's the one copy of your data that isn't subject to either
`storage.sync`'s own quirks or a Downloads-folder cleanup.

You don't have to remember this on your own — Tab Tack tracks how many
entries have changed and how long it's been since your last full export,
and shows a reminder (in the popup and at the top of **View saved
pages**) once either passes a threshold (currently 10 changes or 1 week,
whichever comes first). The "Export full backup now" button on **View
saved pages** does the export and resets the tracking in one click; a
*partial* export (a few checked entries to share with someone) doesn't
reset it, since it doesn't actually cover everything. This only shows a
reminder inside the extension's own pages — no system notification, and
no background script runs to watch for this between visits, consistent
with Tab Tack not running anything when you're not actively using it.

There's also **Import from markdown…**, right next to **Import…** — it
reads a `tab-tack.md` export (the human-readable file, not the JSON one)
and reconstructs entries from it the same way. This exists specifically
for recovering from a lost `storage.sync` (see "If it's the other way
around" below): since the `.md` file is what most people naturally have
a copy of lying around (an old Downloads file, an email attachment, a
backup drive) even without having remembered to do a JSON export, it
works as a second line of defense.

Matching is by normalized URL (ignoring the `#fragment` and a trailing
slash), not by any internal id — two installs never share an entry's id,
so id-based matching would import duplicates every time.

Importing a file means trusting whoever made it somewhat less than you
trust your own typing — see **Security** below for what's actually
validated. An entry with no URL, or one with an unsupported URL scheme, is
rejected rather than imported; the status message reports it separately
("Imported X, skipped Y already saved, rejected Z (missing or unsafe
URL)") so a smaller-than-expected import tells you why.

## Cross-machine sync

Saved entries and categories live in `browser.storage.sync` instead of
`storage.local`, so they follow you automatically to any other machine
signed into the same account — your Firefox Account for Firefox installs,
your Google Account for Chrome/Edge installs. Nothing to configure: as long
as sync is turned on for the browser, a page you save on one laptop shows
up in the popup and in **View saved pages** on the other next time it
syncs. It's private by construction — this only ever reaches machines
signed into *your* account, there's no third-party server involved.

A few things worth knowing:

- **This also makes your data safe against local loss.** Because entries
  live in `storage.sync`, they're stored off-machine by the browser
  vendor's own sync infrastructure (Mozilla's servers for Firefox,
  Google's for Chrome/Edge), not just on one disk. Deleting the browser
  profile, wiping the machine, or losing the `.md` file in a Downloads
  cleanup doesn't lose your saved pages — reinstalling the extension and
  signing back into the same synced account brings them all back.
- **This does not bridge browsers.** Firefox syncs with other Firefox
  installs via your Firefox Account; Chrome/Edge sync with other
  Chromium installs via your Google Account. A page saved in Firefox
  won't show up in Chrome, and vice versa — each browser has its own
  separate synced copy.
- **There's a real size ceiling.** `storage.sync` caps out around 100KB
  total and 512 items, shared across every entry. Each saved entry is
  stored under its own key (so one long annotation can't block the rest
  from syncing), which comfortably fits hundreds of typically-sized
  entries — but it's not unlimited the way local storage or a real
  database would be. If you hit the ceiling, saving will fail with a
  "sync storage may be full" message rather than silently losing data.
- **The Downloads-folder markdown file is still per-machine.** Sync only
  covers the entries themselves (what drives the popup/list UI); the `.md`
  file is regenerated locally from synced data on whichever machine you
  click Save/Edit/Delete on, so each machine's Downloads folder gets its
  own copy of the file, not a shared one.
- If you had entries saved before this feature (in the old
  `storage.local`-only version), they're migrated automatically the first
  time you open the popup or the saved-pages list after updating — no
  action needed, and nothing is lost.
- **View saved pages** refreshes live if new sync data arrives while it's
  open (e.g. you saved something from your other machine a moment ago) —
  no need to close and reopen it.
- **This resilience assumes a real, signed-in sync account.** If you're
  running this as a temporary/unsigned add-on (`about:debugging` → Load
  Temporary Add-on — the normal way to run it during development, before
  it's signed and permanently installed), `storage.sync` isn't guaranteed
  to survive removing and reloading the extension, even with sync enabled.
  Use **Export / import** below (export "select all" periodically) as a
  real backup in that case — don't rely on `storage.sync` alone until the
  extension is permanently installed.

See [ROADMAP.md](ROADMAP.md) for what a higher-ceiling or cross-browser
sync option would look like if this ever becomes limiting.

## If the markdown file gets deleted (e.g. a Downloads cleanup)

The `.md` file is a disposable, regenerable *export* — the real data is
`storage.sync` (see above), which already survives a Downloads-folder
wipe untouched. If the file itself goes missing, click **Download
markdown file** at the top of **View saved pages** to rewrite it from
what's currently saved — no data is actually lost, you just need to
regenerate the file.

## If it's the other way around — `storage.sync` is empty but the `.md` file survived

This can happen if the extension gets removed and reinstalled (see
**Cross-machine sync**'s temporary-add-on caveat above) and sync doesn't
carry over. If you still have a `tab-tack.md` from before (an old
Downloads file, an email attachment, a backup drive — anywhere), click
**Import from markdown…** on **View saved pages** and select it; entries
are reconstructed from the file's structure and restored the same way a
JSON import would be, duplicates skipped by URL as usual.

If you don't have the extension open to do that — say, you're trying to
recover before reinstalling at all — `scripts/md-to-import.js` in this
repo does the same parsing from the command line:

```bash
node scripts/md-to-import.js path/to/tab-tack.md
```

producing a JSON file you can feed into **Import…** once the extension is
back. This is a maintained recovery utility (tracked in `scripts/`, run
with Node), not a one-time fix — the `.md` file is otherwise write-only
from the extension's side.

## Why it re-writes the whole file instead of appending

Browser extensions can't read/write arbitrary files on disk for security
reasons (this isn't Firefox-specific — the same sandboxing applies on
Chrome/Edge). The extension keeps the true list of entries in its own
storage and uses the `downloads` API (with `conflictAction: "overwrite"`)
to save a fresh copy of the complete markdown file each time — same visible
effect as appending, without needing extra software installed. If you ever
want a *true* append to an arbitrary file path (e.g. an Obsidian vault file
outside Downloads), that requires a native messaging host (a companion
script) — happy to build that instead if this turns out to be limiting.

One implication worth being explicit about: once written, the `.md` file
is plain text the extension has no further control over. See **Security**
below for what happens if you point a tool that can *execute* content it
finds inside a note (Obsidian's Templater/Dataview plugins, for example) at
it.

## Installing

### Firefox (from addons.mozilla.org, once the public listing is live)

Search Firefox Add-ons for "Tab Tack" and click **Add to Firefox** — no
manual signing or `.xpi` handling needed; Firefox installs and updates it
like any other add-on. Until the listing is approved, use one of the manual
options below.

### Firefox (temporary, for trying it out)

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` in this folder.
4. The toolbar icon appears immediately. This lasts until you restart Firefox.

### Chrome / Edge / other Chromium browsers (permanent, no signing needed)

Unlike Firefox, Chromium browsers let you load a local folder as a
permanently-installed extension with no signing step — it just stays under
"Developer mode" with a small banner, which is fine for personal use.

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder.
4. The toolbar icon appears immediately and stays installed across
   restarts — no re-loading needed each session, unlike Firefox's
   temporary add-ons.

## Installing permanently on Firefox without the public listing

Firefox requires extensions to be signed to install permanently, even for
personal, unlisted use. Get free API credentials at
https://addons.mozilla.org/developers/addon/api/key/, then:

```bash
AMO_API_KEY=<your key> AMO_API_SECRET=<your secret> npm run sign
```

This runs `web-ext sign --channel=unlisted`. Install the resulting signed
`.xpi` from the `web-ext-artifacts/` folder by dragging it into Firefox. It
stays private (unlisted) — nobody but you can find or install it. (For
submitting the public listing itself, `npm run sign:listed` runs the same
signing step against the `listed` channel instead.)

Alternative: on Firefox Developer Edition or Nightly, set
`xpinstall.signatures.required` to `false` in `about:config` and load the
folder directly without signing.

## Linting

```bash
npx web-ext lint --source-dir .
```

This only validates against Firefox's manifest/API rules — it doesn't check
Chrome-specific behavior. There's no equivalent Chrome-side lint step here;
Chrome/Edge compatibility is verified by loading the unpacked extension and
testing manually (see **Installing** above).

## Testing

```bash
npm test
```

Runs `common.js`'s test suite on Node's built-in test runner (`node --test`,
no extra dependency) — sync storage CRUD, migration from the legacy
storage format, export/import (URL-scheme filtering, duplicate handling,
malformed-file rejection), `renderMarkdown`, and every sanitization
function under **Security** below. `popup.js`/`list.js`/`options.js` are
DOM-rendering glue that would need a real DOM environment to test
meaningfully, so they're exercised manually instead (see **Installing**
above) rather than mocked just to exercise the mock.

## Privacy

Tab Tack collects nothing and phones home to no one — there's no network
request anywhere in the code. Saved entries live in `browser.storage.sync`,
which is your browser vendor's own sync infrastructure (see **Cross-machine
sync** above), not a server this extension controls. The `downloads`
permission is used only to write the markdown file to your own Downloads
folder.

## Security

Tab Tack's threat model is narrow — a local tool, no server, no accounts —
but a few features cross a real trust boundary: importing a JSON or
markdown file someone else made, and auto-filling author/date from a
page's own `<meta>` tags, which any website fully controls. All of these
are treated as untrusted input, not just as "someone else's typing" —
`importEntries()` is the single choke point both the JSON and markdown
import paths funnel through, so the same validation applies regardless of
which file format brought the data in:

- **URL scheme is restricted to `http`/`https`.** Enforced on manual save,
  edit, and import (`isSafeUrl()` in `common.js`). Without this, a crafted
  entry could point `tabs.create()` at a `data:`/`javascript:` URL and show
  a convincing fake page under a disguised title, or at a `file://` path
  into your own filesystem.
- **Markdown-structure injection is neutralized.** `oneLine()` strips
  embedded newlines from title/url/author/date/category before they're
  written into the markdown file; `escapeMarkdownStructure()` does the
  equivalent for the multi-line annotation field. Together they stop a
  crafted value from forging a fake `## heading` entry, a fake `---`
  entry divider, or an unterminated code fence that would swallow every
  entry after it into one code block.
- **Bidi-override link spoofing is stripped.** `stripBidiControls()` /
  `sanitizeEntryFields()` remove Unicode right-to-left-override/isolate
  characters from title/author/date/annotation/category text when an
  entry is saved, edited, or imported — the technique behind "Trojan
  Source" source-code attacks, here usable to make a saved title's link
  text visually lie about what it says. This runs before storage, not
  just when rendering markdown, because the list view renders title as
  plain, unescaped link text with no escaping of its own.
- **No code-execution path exists in the extension.** No `eval`, no
  `new Function`, no `innerHTML`/`outerHTML` assignment of any user- or
  page-derived value anywhere in the code (the only `innerHTML` uses are
  `= ""` clears). `browser.scripting.executeScript` is called exactly
  once, always loading the extension's own static `extract-meta.js` file
  — never a string built from page or imported content. The default
  Manifest V3 content-security-policy applies (no override in
  `manifest.json`), blocking inline scripts and remote script loading
  regardless. The extension also never calls `downloads.open()` — it
  writes files, never opens or launches what it writes, which is the
  actual mechanism that would let a downloaded file execute.
- **Import parsing never executes anything.** `parseImportPayload()` uses
  `JSON.parse` (never `eval`), keeps only entries with a string `url`
  passing the scheme check above, and defaults/type-checks every other
  field before use.
- **The exported `.md`/`.json` files are plain text once they leave the
  extension.** If you feed `tab-tack.md` into a tool that can execute
  content it finds inside a note — e.g. Obsidian with the Templater or
  Dataview community plugins configured to run code from note content —
  treat it like any file from an outside source: data to read, not
  trusted input to execute. Tab Tack's own guarantees stop at the file it
  writes; they don't extend to what another program chooses to do with it.
- **Permissions are minimal and each is used exactly where declared:**
  `activeTab` (read the current tab's title/URL; scopes `scripting` to
  it — no `<all_urls>` or other broad host permission is requested),
  `scripting` (inject the bundled `extract-meta.js` to read a page's own
  meta tags), `downloads` (write the markdown/JSON export files),
  `storage` (the synced entries/categories and the local filename
  setting).

See `common.js` for the implementation of every function named above, and
**Testing** above for the tests that pin this behavior down.

## Reporting bugs / feedback

[GitHub Issues](https://github.com/haimbar/tab-tack/issues) on this repo.

## License

MIT — see [LICENSE](LICENSE).
