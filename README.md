# Tab Notes to Markdown

A small Firefox extension. Click the toolbar button on any page to save its
title, URL, (auto-detected) author/date, the time you saved it, and your own
typed annotation as a new entry in a markdown file.

## How it works

- Click the toolbar icon → a popup shows the page's title and URL (pre-filled),
  an author/date field (auto-filled from the page's meta tags when present),
  a category picker, and a text box for your own note.
- Categories: check any existing ones from the list, and/or type new ones
  (comma-separated) in the box below it. Anything new you type is remembered
  for next time, so your category list grows as you use it.
- Click **Save to markdown file**. The entry is appended to an internal list
  (kept in the extension's local storage) and the *entire* file is re-written
  to your Downloads folder, overwriting the previous version.
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

This list is read from the extension's own storage (the same data used to
generate the markdown file), not from the `.md` file itself — so it stays
in sync even before you've saved a new entry.

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

## Why it re-writes the whole file instead of appending

Firefox extensions can't read/write arbitrary files on disk for security
reasons. The extension keeps the true list of entries in its own storage and
uses the `downloads` API (with `conflictAction: "overwrite"`) to save a fresh
copy of the complete markdown file each time — same visible effect as
appending, without needing extra software installed. If you ever want a
*true* append to an arbitrary file path (e.g. an Obsidian vault file outside
Downloads), that requires a native messaging host (a companion script) —
happy to build that instead if this turns out to be limiting.

## Installing (temporary, for trying it out)

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` in this folder.
4. The toolbar icon appears immediately. This lasts until you restart Firefox.

## Installing permanently

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
