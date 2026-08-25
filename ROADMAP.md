# Roadmap: sync, sharing, cross-browser

What's implemented is documented in the README and the git log, not here —
this file only tracks what's still **pending** or worth knowing before
building the next thing.

**Done:** private cross-machine sync via `browser.storage.sync` (README:
"Cross-machine sync"), Chromium support (Chrome/Edge/etc., README:
"Supported browsers"), a "Re-export markdown now" button, and a known,
deliberately-deferred limitation (same-machine multi-browser filename
collision — see below).

**Not done:** everything else in this file.

## Purpose / scope

Not a bookmarks replacement or a citation manager — though it can be used
as either. The actual use case: papers/websites that matter for a project
but can't be dealt with right now and shouldn't be forgotten, without
relying on a pile of open tabs (costly) or "email it to myself" (unreliable).
Expected volume: a few dozen entries a month is *possible* but not the
common case. This shapes priority — see the volume/database note under
item 1, and why items 2 and 3 are parked below.

---

## 1. Cross-machine sync beyond `storage.sync`

`storage.sync` is cheap and already shipped, but it has two structural
limits worth remembering if either becomes a real problem:

- **Doesn't bridge browsers.** Firefox syncs with other Firefox installs
  via Firefox Account; Chrome/Edge sync via Google Account. A page saved
  in one browser family never appears in the other.
- **Real size ceiling.** ~100KB total / 8KB per item / 512 items. Each
  entry has its own key, which comfortably fits hundreds of typical
  entries, but it's not unlimited.

Options if either limit bites:

| Option | Complexity | Notes |
|---|---|---|
| B. GitHub-backed sync (Gist or repo file) | **Medium** | Reuses the repo/account already set up for this project |
| C. Dedicated small backend (Worker/Supabase/Firebase) | **High** | Real infrastructure to run and maintain |
| D. Native messaging + user's own file-sync tool (Dropbox/Syncthing/iCloud) | **Medium-High** | Delegates syncing to a tool the user already runs, but requires building a native messaging host first |

**B — GitHub-backed sync.** Push/pull a JSON blob of entries to/from a
private Gist or a file in the repo, authenticated with a personal access
token stored in `storage.local` (never synced, never leaves the device
except to talk to `api.github.com`).
- Pros: no practical size ceiling, bridges browser families (it's our own
  sync, not the browser's), reuses infrastructure already trusted and
  already in place.
- Cons: needs a PAT the user generates and pastes into Options; needs a
  new host permission for `api.github.com`; naive conflict handling
  (e.g. last-write-wins) could lose an edit if two machines change the
  same entry before syncing — acceptable for personal low-frequency use.

**C — dedicated backend.** Only worth building if item 2 (sharing) is
also a near-term goal — see below; building it *just* for private sync
is disproportionate.

**D — native messaging + external file sync.** Would need the native
messaging host that's also relevant to a truly custom output-file path
(see the "Why it re-writes the whole file" section in the README). Today
`storage.sync` — not the file — is the source of truth the popup/list
page read from; making the file authoritative would mean re-reading it
back on load too, needing native messaging in both directions.

**Not urgent.** Given the actual usage pattern (see Purpose/scope above),
the `storage.sync` ceiling isn't expected to bite from volume alone.
The real trigger for revisiting this is a *usage shift*, not just a
count: if the list grows very long **and** the tool starts getting used
more broadly — real citation collection, generating stats on one's own
reading/interests, etc. — that's when a proper, more compact/efficient
database (not just a bigger sync quota) becomes the right move, and B/C
above should be re-evaluated together rather than B alone as a
band-aid. Until then: no action needed.

---

## 2. Sharing items with others (by name, or public)

Not started. This is a different kind of feature from sync — "share by
name" requires identifying another person and controlling their access,
which the current local-only architecture has no concept of at all. Some
form of GitHub-hosted or server-side piece is required no matter which
option is chosen.

| Option | Complexity | Notes |
|---|---|---|
| A. Reuse GitHub (collaborators / Gists / Pages) | **Low-Medium** | No new backend; coarse-grained access |
| B. Real backend with accounts + per-item ACLs | **High** | The "real" version of this feature; a genuine service to run |
| C. Manual export (markdown/HTML snippet to send yourself) | **Very low** | Barely "sharing," more of a stopgap |

**A — GitHub-based.** "By name" = add someone as a collaborator on a
private repo (secret Gists are really "unlisted," not identity-checked —
anyone with the link can view). "Public" = push to a public repo, or a
static page via GitHub Pages generated from the markdown.
- Pros: no backend to host, reuses the account/repo already in place, free.
- Cons: access control is repo/Gist-level, not per-entry — sharing "these
  3 items with this 1 person" cleanly means one repo per share, which
  gets unwieldy fast. Recipients need a GitHub account for private-repo
  access. No live filtering/sorting UI unless a static-site build step is
  added. No expiring links, no per-viewer control.

**B — real backend.** Actual accounts, an entries table, an access-control
table (or share-link tokens), hosted somewhere (Cloudflare Workers +
D1/KV, Supabase, Firebase, etc.). "Public" becomes a real hosted page;
"by name" becomes a real per-person grant, revocable later.
- Pros: this is what "share by name" actually means if taken literally —
  fine-grained, revocable, a real viewing experience (could reuse the
  `list.html` UI, server-rendered). **Would also solve item 1 properly**
  — a backend that stores entries is naturally a sync source of truth
  too, so items 1 and 2 could become the *same* infrastructure if sharing
  turns out to be a real priority.
- Cons: turns a personal browser tool into an actual multi-user service —
  accounts/auth, a database, hosting cost, a privacy story once other
  people's names/emails and private annotations might pass through it,
  and materially more build time (weeks, not days). Highest-complexity
  item on this whole roadmap by a wide margin — worth pausing on
  deliberately before committing, not drifting into.

**C — manual export.** Select entries → generate a markdown snippet or a
small standalone HTML file → send it yourself.
- Pros: trivial, zero infrastructure.
- Cons: not really "sharing" in the connected sense — a stopgap.

**Decision: parked, not urgent.** Consistent with the actual use case
(a personal deferred-reading queue, not a collaboration tool) — sharing
isn't a near-term need. If it becomes one: ship **A** first, cheap and
reuses what's already in place. Treat **B** as a deliberate, separate
decision, and consider bundling it with item 1 if it's ever built, since
it would subsume `storage.sync`/GitHub-sync entirely.

---

## 3. Safari support

Not started, and a different category of effort than the Chromium work
that's already done: Safari Web Extensions must be wrapped in a native
macOS/iOS app shell built with Xcode. Apple's
`safari-web-extension-converter` scaffolds the Xcode project from the
existing extension source, and Safari's WebExtension API coverage for
what's used here (storage, tabs, scripting, downloads-equivalent) is
reasonably close to parity — but this still needs a Mac, Xcode, and for
anything beyond a 7-day local test build, an Apple Developer account
($99/yr) plus notarization or App Store review.

**Decision: parked, not planned soon.** The Mac/Xcode/Developer-account
setup and $99/yr cost aren't worth it right now. Accepted fallback for
Safari users in the meantime: open the `.md` file directly — it's
readable (plain text; Safari has no built-in markdown rendering, so
headings/formatting show as literal `##`/`**` characters) but not
reliably clickable, since plain-text URLs generally aren't
auto-linkified by the browser — and there's no add/edit/delete/sort UI
without the extension. Good enough as a read-only stopgap; revisit only
if Safari becomes part of daily use.

---

## Known limitations (deferred, not blocking)

- **Same-machine, multiple-browser filename collision.** Running the
  extension in two browsers on one machine means each has its own
  separate `storage.sync` data (sync doesn't bridge browsers — see item
  1), but by default both still write their markdown export to the same
  `~/Downloads/tab-notes.md`, so whichever browser saves last overwrites
  the other's file. Fix would be trivial (a per-browser default filename
  in Options), but deliberately not done: most users, including the
  primary user of this extension, don't switch browsers often enough for
  this to matter in practice. Revisit if that changes.

## Still open

- For sync: is "two of my own machines, same browser" the actual real
  need, or does cross-browser sync (Firefox laptop ↔ Chrome desktop)
  matter in practice? That alone would rule out `storage.sync` as a
  long-term answer regardless of volume. Not urgent either way per the
  Purpose/scope note above, but worth settling if it comes up.
