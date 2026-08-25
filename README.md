# Tab Notes to Markdown

A small browser extension. Click the toolbar button on any page to save its
title, URL, (auto-detected) author/date, the time you saved it, and your own
typed annotation as a new entry in a markdown file.

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
- Default output file: `Downloads/tab-notes.md`. Change the filename (or use
  a subfolder, e.g. `notes/tab-notes.md`) via the extension's Options page
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

- Search by title, URL, or note text.
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
- **Re-export markdown now** rewrites the `.md` file immediately from
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

See [ROADMAP.md](ROADMAP.md) for what a higher-ceiling or cross-browser
sync option would look like if this ever becomes limiting.

## If the markdown file gets deleted (e.g. a Downloads cleanup)

The `.md` file is a disposable, regenerable *export* — the real data is
`storage.sync` (see above), which already survives a Downloads-folder
wipe untouched. If the file itself goes missing, click **Re-export
markdown now** at the top of **View saved pages** to rewrite it from
what's currently saved — no data is actually lost, you just need to
regenerate the file.

## Why it re-writes the whole file instead of appending

Firefox extensions can't read/write arbitrary files on disk for security
reasons. The extension keeps the true list of entries in its own storage and
uses the `downloads` API (with `conflictAction: "overwrite"`) to save a fresh
copy of the complete markdown file each time — same visible effect as
appending, without needing extra software installed. If you ever want a
*true* append to an arbitrary file path (e.g. an Obsidian vault file outside
Downloads), that requires a native messaging host (a companion script) —
happy to build that instead if this turns out to be limiting.

## Installing

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

## Installing permanently on Firefox

Firefox requires extensions to be signed to install permanently (even for
personal, unlisted use). Easiest path:

```bash
npx web-ext sign --api-key=<AMO_JWT_ISSUER> --api-secret=<AMO_JWT_SECRET> --channel=unlisted
```

Get free API credentials at https://addons.mozilla.org/developers/addon/api/key/,
then install the resulting signed `.xpi` from the `web-ext-artifacts/` folder
by dragging it into Firefox. It stays private (unlisted) — nobody but you can
find or install it.

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
