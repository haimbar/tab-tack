# Roadmap: sync, sharing, cross-browser

What's implemented is documented in the README and the git log, not here —
this file only tracks what's still **pending** or worth knowing before
building the next thing.

**Done:** private cross-machine sync via `browser.storage.sync` (README:
"Cross-machine sync"), Chromium support (Chrome/Edge/etc., README:
"Supported browsers"), a "Re-export markdown now" button, JSON
export/import for manual sharing and backup (README: "Export / import" —
item 2's option C below), and a known, deliberately-deferred limitation
(same-machine multi-browser filename collision — see below).

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

**Option C is done** — see README: "Export / import." What's below is
kept for the parked A/B options and the reasoning behind picking C
first. "Share by name" (A) or "public" (B) would still require
identifying another person and controlling their access, which the
current local-only architecture has no concept of at all — some form of
GitHub-hosted or server-side piece would be required for either.

| Option | Complexity | Notes |
|---|---|---|
| A. Reuse GitHub (collaborators / Gists / Pages) | **Low-Medium** | No new backend; coarse-grained access |
| B. Real backend with accounts + per-item ACLs | **High** | The "real" version of this feature; a genuine service to run |
| C. Manual export/import (JSON, URL-deduped) | **Very low** | **Done** — see README: "Export / import" |

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

**C — manual export/import. Done** (2026-08-25) — see README: "Export /
import" for user-facing behavior; `buildExportPayload`/`parseImportPayload`/
`importEntries` in `common.js` for the implementation.
- Turned out useful sooner than expected: built primarily to recover from
  a `storage.sync` data-loss incident on a temporary/unsigned install (see
  README's temporary-add-on caveat under "Cross-machine sync"), with
  person-to-person sharing as the other intended use — both share the
  same export/import mechanism.
- Cons (unchanged from the original assessment): not really "sharing" in
  the connected/live sense — no revocation, no per-viewer control,
  recipient has to take a manual step. Two people can still create
  genuinely different entries for the same page (e.g. edited notes) that
  URL-based dedup won't catch — import always keeps the local copy and
  skips the incoming one on a URL match, never merges field-by-field.
- Format: JSON (title/url/author/date/categories/annotation/saved/
  savedDisplay), not the markdown file — markdown is for reading, JSON is
  what import parses back reliably.
- Dedup key: `normalizeUrl(e.url)`, not the entry's `id` — two installs
  generate unrelated random ids for what is conceptually "the same" saved
  page, so an id-based check would import duplicates every time.

If a more connected/live version is ever needed, treat **B** as the
deliberate, separate decision it already is, and consider bundling it
with item 1 since it would subsume `storage.sync`/GitHub-sync entirely;
**A** stays available if a lighter step up from C is wanted first.

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

## 4. Automated build/sign/update pipeline (CI-driven releases)

Not started. Now that it's permanently installed (signed `.xpi` via
Firefox's unlisted self-distribution channel — see README: "Installing
permanently on Firefox"), new commits don't reach the installed copy on
their own: signing is a manual, per-release step (bump `manifest.json`
version → `npm run sign` → reinstall the `.xpi`). Fine for occasional
personal updates; would get old fast if this starts changing weekly, or
if a few other people are running signed copies too and each needs a new
file handed to them by hand.

Real auto-update needs two things Firefox checks on its own: a
`browser_specific_settings.gecko.update_url` in the manifest pointing to
a hosted, versioned JSON update manifest, and each signed `.xpi`
reachable at a stable URL. Both need somewhere to live — GitHub Releases
(for the `.xpi` binaries) plus GitHub Pages (for the update-manifest
JSON) are the natural fit given the repo's already on GitHub, driven by a
GitHub Actions workflow (on push or tag) that runs `web-ext sign` with
the AMO API key/secret stored as repo secrets, then republishes the
update manifest pointing at the new file.

**Decision: parked, not urgent.** Same reasoning as items 1-3: build this
when the manual reinstall loop actually becomes a real annoyance
(frequent releases, or several other people running signed copies who'd
otherwise need a new `.xpi` handed to them each time), not preemptively.
Until then, `npm run sign` + reinstall per release is a 30-second step,
not a burden.

---

## 5. Chrome Web Store private/unlisted publishing (remove the dev-mode nag)

Not started. Chromium's "Developer mode + Load unpacked" (see README:
"Chrome / Edge / other Chromium browsers") is already a *working*
permanent install — unlike Firefox's temporary add-ons, it survives
restarts with no signing step required. The only downside: Chrome
periodically nags with a "Disable developer mode extensions" banner
(dismissible, doesn't actually disable anything) as long as it's loaded
this way.

The fix, if the nag ever becomes annoying enough to bother with: publish
to the Chrome Web Store with visibility set to **Private** (restricted to
specific Google accounts you list) or **Unlisted** (installable by direct
link, not searchable) rather than **Public**. Either keeps it out of the
searchable store, same spirit as Firefox's unlisted self-distribution
channel (item 4's `web-ext sign --channel=unlisted`).

Requires:
- A one-time $5 Chrome Web Store developer registration fee (per Google
  account, not per extension).
- Packaging + upload via the [Chrome Web Store Developer
  Dashboard](https://chrome.google.com/webstore/devconsole) (or the
  Chrome Web Store publish API for CI, if item 4's pipeline is ever
  extended to also cover Chrome).
- Google review — lighter for Private/Unlisted than a full Public
  listing, but still a real review step, and can take longer than
  Firefox's unlisted signing (usually a couple of minutes).
- Bonus if it's ever done: native auto-update, same as any Chrome Web
  Store extension — installed copies update themselves with no manual
  reinstall, something item 4's Firefox path needs a whole CI pipeline to
  replicate.

**Decision: parked, not urgent.** The dev-mode nag is cosmetic, not
functional — dismissing it doesn't disable the extension. Worth doing if
Chrome/Edge becomes the daily-driver browser, or the nag gets genuinely
annoying; not worth the $5 + review-queue wait otherwise.

---

## Known limitations (deferred, not blocking)

- **Same-machine, multiple-browser filename collision.** Running the
  extension in two browsers on one machine means each has its own
  separate `storage.sync` data (sync doesn't bridge browsers — see item
  1), but by default both still write their markdown export to the same
  `~/Downloads/tab-tack.md`, so whichever browser saves last overwrites
  the other's file. Fix would be trivial (a per-browser default filename
  in Options), but deliberately not done: most users, including the
  primary user of this extension, don't switch browsers often enough for
  this to matter in practice. Revisit if that changes.

- **The `.md` file is a "download" by classification, not just by
  location — changing where it lands doesn't change that.** Raised
  (2026-10-01) after a real incident: removing/reinstalling the
  extension lost `storage.sync` (the documented temporary-add-on risk
  under "Cross-machine sync"), and the only remaining record was the
  `.md` file — recovered via `scripts/md-to-import.js`, which parses it
  back into a Tab Tack JSON import. Kept and tracked as a maintained
  recovery tool rather than thrown away after use, since
  removal/reinstall losing sync is a real recurring risk this project
  explicitly documents, not a one-time fluke. That incident also
  prompted the question of making the `.md` file itself safe
  from Downloads-folder cleanup (manual, browser "Clear Recent
  History," CCleaner, etc.) by defaulting its location to the home
  directory instead. Rejected: `browser.downloads.download()` can't
  target an absolute path outside the browser's configured Downloads
  folder at all (relative-path-only, no `..`), and even redirecting
  Firefox's own Downloads location wouldn't actually fix the underlying
  concern — cleanup tools generally key off the browser's download
  history/"this was a download" classification, not a specific folder,
  so the file stays a cleanup target wherever it physically lands. The
  only way to write a file that's genuinely indistinguishable from one
  the user created directly (never entering download history at all) is
  a native messaging host — the same companion-program requirement
  already noted under "Why it re-writes the whole file instead of
  appending" in the README for true arbitrary-path writes.
  **Decision: not now.** Data safety doesn't actually depend on the
  `.md` file surviving — `storage.sync` plus JSON Export/Import already
  cover that independently of any file on disk (as the recovery above
  demonstrated). The `.md` file keeps its existing disposable/
  regenerable design; building a native messaging host just to make the
  readable export file itself cleanup-proof isn't worth a second
  installable component unless that file's survival starts mattering
  for its own sake, not as a backup mechanism.
  - **Follow-up** (2026-10-09): `scripts/md-to-import.js` only helped
    because the person running it (the developer) could clone the repo
    and run Node. With a public AMO listing in mind, that's not a real
    recovery path for an ordinary user who hits the same
    removal/reinstall sync loss. Added `parseMarkdownExport()` to
    `common.js` (the same parsing logic, now shared rather than
    duplicated in the script) and an **Import from markdown…** button
    in `list.html`, so recovery from an old `.md` file works entirely
    through the UI — `scripts/md-to-import.js` now just calls the
    shared function and remains useful as a command-line fallback for
    when the extension itself isn't available to do the import.

## Still open

- For sync: is "two of my own machines, same browser" the actual real
  need, or does cross-browser sync (Firefox laptop ↔ Chrome desktop)
  matter in practice? That alone would rule out `storage.sync` as a
  long-term answer regardless of volume. Not urgent either way per the
  Purpose/scope note above, but worth settling if it comes up.


## Similar Add-ons

Checked against this project's actual feature set (per-URL notes, categories,
markdown export, cross-machine sync, no forced account, planned
export/import sharing — see item 2):

| Extension | Notes on page | Categories/tags | Export | Sync | Account |
|---|---|---|---|---|---|
| [StashRead](https://addons.mozilla.org/en-US/firefox/addon/stashread/) | No (reader-view saving, not annotation) | Yes (tags) | EPUB + JSON backup | No | None required |
| [Cairn](https://addons.mozilla.org/en-US/firefox/addon/cairn/) | Yes | Yes (tags + nested collections) | JSON export/import | No | None required |
| [Notefox / websites-notes](https://addons.mozilla.org/en-US/firefox/addon/websites-notes/) | Yes | Yes | Yes, format unspecified | Optional, requires their account | Optional |
| [Tab Notes](https://addons.mozilla.org/en-US/firefox/addon/tab-notes/) (new-tab notepad) | No — one note per new tab, not per page | No | No | No | None |
| [TabNotes / leave-notes-on-any-page](https://addons.mozilla.org/en-US/firefox/addon/leave-notes-on-any-page/) | Yes | No | No | Yes, via Firefox's built-in sync | None (rides Firefox sync) |
| [Notes by Firefox](https://addons.mozilla.org/en-US/firefox/addon/notes-by-firefox/) | Sidebar notes while browsing | Unclear | Unclear | Yes, requires signing into a Firefox Account | Required for sync |
| [TabMark](https://addons.mozilla.org/en-US/firefox/addon/tabmark/) | No — saves a whole window's open tabs under a title, not per-page annotation | No | No | No | None required |

**Closest overall: Cairn** — real per-page notes, tags/collections, no
account, and it already does JSON export/import, close to what item 2's
option C specs. Missing vs. this project: no cross-device sync (item 1
still unsolved), and export is JSON only (no markdown, so the "Re-export
markdown now" readable-file feature would be lost).

**Cairn disqualified anyway — permissions/data collection.** Its AMO
listing requires "Access your data for unifybrowse.com" and "Access your
data for analytics.unifybrowse.com," and declares required data
collection of "Personally identifying information." That's a real
architectural difference from this project (fully local, no first-party
or analytics domain, no PII collection ever) and a dealbreaker regardless
of how close the feature set is — noting it here so it doesn't get
re-suggested later as a drop-in replacement or a library to interoperate
with.

**Runner-up: TabNotes** (`leave-notes-on-any-page`) — the only one with
real automatic cross-device sync (Firefox's built-in sync, same mechanism
as this project's `storage.sync`), but no tags/categories and no export
at all.

**Conclusion:** none of the six covers this project's full feature set,
and the closest match (Cairn) is ruled out on privacy grounds independent
of features. No change to the item 1/2 plans above — build, don't adopt.

## Before Release Items

- ~~Write Help pages: one for the mozilla database (what the user sees when
  they search for add-ons -- a short description of the package, maybe
  screenshots?)~~ **N/A while unlisted** (2026-08-26) — this assumes a
  public AMO search-listing page, which doesn't exist for unlisted
  self-distribution (no one finds this via AMO search; the `.xpi` is
  handed over directly). README already documents every feature in
  detail. Revisit if this ever goes listed publicly on AMO.
- ~~How can users report bugs? Github? Mozilla?~~ **Done** (2026-08-26) —
  GitHub Issues on this repo (README: "Reporting bugs / feedback";
  `package.json`'s `bugs` field). Settled easily because release is still
  unlisted self-distribution (see "Still open" below) — no Mozilla-hosted
  listing page to route through instead. Revisit if this ever goes listed
  publicly on AMO, where a Mozilla-side support/abuse-report path also
  comes into play.
- ~~Add tests to run before each release~~ **Done** (2026-08-26) — `npm
  test` runs `node --test test/*.test.js` (Node's built-in test runner,
  no new dependency). `test/common.test.js` covers `common.js`'s sync
  storage CRUD, migration-from-legacy-storage, export/import (including
  dedup and malformed-file rejection), and `renderMarkdown`/`oneLine`
  (with a direct regression test for the markdown-injection fix above).
  `common.js` isn't a CommonJS module — `test/support/load-common.js`
  compiles its source via `vm.compileFunction` with a mock
  `browser.storage`, run in the same realm as the test file, and exposes
  its top-level functions directly. Deliberately out of scope:
  popup.js/list.js/options.js (DOM-rendering glue needing a real DOM to
  test meaningfully) and writeMarkdownFile/exportEntriesToFile (thin
  wrappers over browser.downloads/Blob with little logic of their own).
- ~~Perform a through security risk analysis~~ **Done** (2026-08-26) —
  full read-through of `manifest.json` and every `.js`/`.html` file, plus a
  git-history/`.gitignore` check for leaked secrets.
  - **Confirmed clean:** MV3 with minimal permissions (no `<all_urls>`),
    all entry data rendered via `.textContent`/`.value` (no DOM XSS), no
    `eval`/inline scripts/remote code, `data_collection_permissions:
    required: ["none"]`, no credentials in code or git history (`web-ext
    sign` reads `$AMO_API_KEY`/`$AMO_API_SECRET` from env), import path
    uses `JSON.parse` with type-checked filtering.
  - **One finding, fixed:** `extract-meta.js` pulls `author`/`date` from a
    page's own `<meta>` tags — fully attacker-controlled content — and
    `renderMarkdown()` concatenated them unescaped into the `.md` file. A
    page could embed a newline-containing meta value to inject a fake
    `## entry` block into the user's real notes file (same injection point
    for a crafted shared/imported JSON export). Not code execution — a
    static file — but a real spoofing/integrity issue. Fixed via a
    `oneLine()` helper in `common.js` that strips `\r`/`\n` from
    title/url/author/date/category strings at render time; `annotation`
    is left untouched since it's the user's own free-typed multi-line
    text, not extracted from an untrusted page.
  - **Noted, no action needed:** `downloads` permission is broader than
    what's used (only `.download()`/`.onChanged`) — unavoidable, it's the
    only permission WebExtensions offers for this; URL scheme isn't
    validated before "Open," mitigated by Firefox itself rejecting
    `javascript:`/privileged schemes in `tabs.create()`; `storage.sync`
    routes entries through Mozilla/Google's sync infra, already disclosed
    in README's "Cross-machine sync."
  - **Superseded** (2026-09-17) — a second pass prompted by actually
    preparing to submit the public AMO listing found the two "no action
    needed" calls above too optimistic, plus two more gaps, all now fixed
    (README: "Security" has the user-facing version; `common.js` has the
    code):
    - `annotation` turned out not to be safe to leave untouched — it can
      arrive from an *imported* JSON file someone else authored, not just
      from the user's own typing. `escapeMarkdownStructure()` now
      neutralizes heading/`---`-divider/code-fence lines in it the same
      way `oneLine()` already did for the single-line fields, without
      collapsing its legitimate multi-line structure.
    - URL scheme is now actually validated (`isSafeUrl()`, http/https
      only) on save/edit/import, rather than relying on `tabs.create()`
      to reject something on its own — `data:`/`javascript:`/`file://`
      entries are rejected before they're ever stored.
    - Unicode bidi-override characters (RTL-override spoofing, "Trojan
      Source"-style) weren't considered in the original pass at all —
      `stripBidiControls()` now strips them from title/author/date/
      annotation/category at every write path, since the list view
      renders title as unescaped link text with no markdown-layer
      protection to fall back on.
    - Confirmed (not just assumed) there's no `downloads.open()` call
      anywhere, i.e. no path where the extension itself launches a
      downloaded file with the OS's default handler — the mechanism that
      would actually let a "self-extracting" file execute.
