# Roadmap: sync, sharing, cross-browser

Planning notes for what's still ahead. **Status: items 1A (`storage.sync`)
and 3a (Chromium support via `webextension-polyfill`) are now implemented**
— see the README for how they work. The options/pros/cons analysis below
is kept as originally written for context on why those were picked first;
everything under items 1B/1C, 2, and 3b is still just planning, not
implemented.

Current architecture recap: entries/categories live in `browser.storage.sync`
(one key per entry); the markdown file is a derived export written via
`downloads.download`; there is no backend, no accounts, and no server
anywhere in the extension.

These three goals are not equally sized. (1) and (3) are compatibility/
plumbing work on top of what exists. (2) is a different kind of project —
it implies identifying other people and controlling access, which the
current local-only architecture has no concept of at all.

---

## 1. Cross-machine sync (private, same user)

| Option | Complexity | Notes |
|---|---|---|
| A. `browser.storage.sync` | **Low** | Built into the browser, private by construction |
| B. GitHub-backed sync (Gist or repo file) | **Medium** | Reuses the repo/account you already have |
| C. Dedicated small backend (Worker/Supabase/Firebase) | **High** | Real infrastructure to run and maintain |
| D. Native messaging + user's own file-sync tool (Dropbox/Syncthing/iCloud) | **Medium-High** | Delegates syncing itself, but requires building the native host we already scoped out and skipped |

**A — `storage.sync`.** Swap `storage.local` for `storage.sync` for the
entries/categories data. Firefox syncs it via the user's Firefox Account;
Chrome would sync via Google Account (relevant once item 3 lands). No new
code beyond the storage calls themselves — this is close to a drop-in
change.
- Pros: no backend, no accounts to build, private by definition (only
  reachable by the browser account it's tied to), ships in an afternoon.
- Cons: **real quota ceiling** — Firefox's `storage.sync` caps out around
  100KB total / 8KB per item / 512 items. A single item over 8KB (one
  entry with a long annotation, stored as part of one big array) would
  silently fail to sync. Workable if entries stay short and modest in
  number (low hundreds), but would need restructuring to one-key-per-entry
  to even approach the ceiling safely, and there's a hard wall past that —
  it will not scale to "years of heavy use." Also: this only syncs within
  one browser family/account, not across Firefox↔Chrome.

**B — GitHub-backed sync.** Push/pull a JSON blob of entries to/from a
private Gist or a file in the repo you already created, authenticated with
a personal access token stored in `storage.local` (never synced, never
leaves the device except to talk to `api.github.com`).
- Pros: no practical size ceiling, works across browser vendors (since it's
  our own sync, not the browser's), reuses infrastructure you already trust
  and already have (this very repo). Moderate implementation: a fetch-based
  push/pull plus a simple conflict rule (e.g. "newest `saved` timestamp
  wins" per entry, or just last-write-wins on the whole file to start).
- Cons: needs a PAT the user generates and pastes into Options — a bit of
  setup friction; needs a new host permission for `api.github.com`; naive
  conflict handling could lose an edit if two machines change the same
  entry before syncing (acceptable for personal low-frequency use, worth
  flagging).

**C — dedicated backend.** Only worth building if item 2 (sharing) is also
a near-term goal — see the note at the end of this doc. Building it *just*
for private sync is disproportionate.

**D — native messaging + external file sync.** If we ever build the native
messaging host mentioned in the original README (for true arbitrary-path
file writes), pointing the output file at a Dropbox/Syncthing/iCloud folder
would sync it "for free" via tools the user already runs. But today
`storage.local`/`storage.sync` — not the file — is the source of truth the
popup and list page actually read from; the `.md` file is just an export.
Making the file authoritative would mean re-reading it back on load too,
which needs native messaging in *both* directions and touches most of the
app. This is really "build the native host, then sync becomes a side
effect of a tool the user already has" — a bigger, different project.

**Recommendation:** Start with **A** as a cheap MVP, explicit about its
volume ceiling. Move to **B** if/when that ceiling becomes a real problem,
since it reuses what you already have set up. Treat C and D as later
options, not defaults.

---

## 2. Sharing items with others (by name, or public)

This is the odd one out: it's not an extension of the current architecture,
it's a new kind of feature. "Share by name" requires identifying another
person and controlling their access to specific data — the current design
has no notion of other users at all, so *something* server-side or
GitHub-hosted has to exist no matter which option is chosen.

| Option | Complexity | Notes |
|---|---|---|
| A. Reuse GitHub (collaborators / Gists / Pages) | **Low-Medium** | No new backend; coarse-grained access |
| B. Real backend with accounts + per-item ACLs | **High** | The "real" version of this feature; a genuine service to run |
| C. Manual export (markdown/HTML snippet to send yourself) | **Very low** | Barely "sharing," more of a stopgap |

**A — GitHub-based.** "By name" = add someone as a collaborator on a
private repo (or private Gist — though secret Gists are really "unlisted,"
not identity-checked, since anyone with the link can view). "Public" =
push to a public repo, or serve a static page via GitHub Pages generated
from the markdown.
- Pros: no backend to host, reuses the account/repo you already have and
  trust, free.
- Cons: access control is repo/Gist-level, not per-entry — sharing "these
  3 items with this 1 person" cleanly means one repo per share, which gets
  unwieldy. Recipients need a GitHub account for private-repo access
  (fine for a technical audience, friction otherwise). No live filtering/
  sorting UI unless a static-site build step is added on top. No
  expiring links, no per-viewer control.

**B — real backend.** Actual accounts, an entries table, an access-control
table (or share-link tokens), hosted somewhere (Cloudflare Workers +
D1/KV, Supabase, Firebase, etc.). "Public" becomes a real hosted page;
"by name" becomes a real per-person grant, revocable later.
- Pros: this is what "share by name" actually means if taken literally —
  fine-grained, revocable, a real viewing experience (could reuse the
  `list.html` UI, server-rendered). **This would also solve item 1
  properly** — a backend that stores entries is naturally a sync source of
  truth too, which is worth noting since it means items 1 and 2 could
  become the *same* piece of infrastructure if sharing turns out to be a
  real priority.
- Cons: this turns a personal browser tool into an actual multi-user
  service — accounts/auth, a database, hosting cost (usually fine on free
  tiers at small scale, but a real ongoing dependency), a privacy story
  once other people's names/emails and someone's private annotations might
  pass through it, and materially more build time (weeks, not days). This
  is the highest-complexity item across the whole roadmap by a wide
  margin, and the one most worth pausing on before committing to.

**C — manual export.** Select entries → generate a markdown snippet or a
small standalone HTML file → send it yourself (email, Slack, AirDrop).
- Pros: trivial to build, zero infrastructure, zero new security surface.
- Cons: not really "sharing" in the connected sense (no link, no revoking,
  no updates) — a stopgap rather than the feature as described.

**Recommendation:** Ship **A** first if sharing is wanted soon — it's cheap
and reuses what already exists. Treat **B** as a deliberate, separate
decision to make later (not a natural next step from A), and specifically
consider bundling it with item 1 if/when it's built, since it would
subsume `storage.sync`/GitHub-sync entirely.

---

## 3. Cross-browser support

| Sub-target | Complexity | Notes |
|---|---|---|
| 3a. Chrome / Edge / Brave / Opera (all Chromium) | **Low-Medium** | One compatibility pass covers all four |
| 3b. Safari | **Medium-High** | Different distribution model entirely |

**3a — Chromium family.** These share one engine and one extensions
system, so supporting Chrome effectively supports Edge/Brave/Opera too.
Concretely:
- Add the standard `webextension-polyfill` (Mozilla's own library) so the
  existing `browser.*`-based code runs unchanged on Chrome, which natively
  uses `chrome.*`. This is the well-trodden path most cross-browser
  extensions use.
- `manifest.json` is largely already compatible — no `background` key is
  in use today (everything runs in the popup/list page), so the usual MV3
  Chrome-vs-Firefox background-script split (`service_worker` vs
  `scripts`) doesn't even apply here. `browser_specific_settings.gecko` is
  ignored harmlessly by Chrome.
- Needs verification, not redesign: `downloads.download` with
  `conflictAction: "overwrite"`, and `scripting.executeScript` with
  `files`, both need a real smoke-test on Chrome to confirm identical
  behavior (expected to work, Chrome supports both, but should be checked
  rather than assumed).
- Bonus: unlike Firefox, Chrome lets an unpacked extension stay installed
  permanently from Developer Mode with **no signing step at all** — so the
  "permanent install" friction from earlier in this project is actually
  *easier* to solve on Chrome than on Firefox.

**3b — Safari.** A different distribution model, not just a different API:
Safari Web Extensions must be wrapped in a native macOS/iOS app shell built
with Xcode. Apple provides a converter tool
(`safari-web-extension-converter`) that scaffolds the Xcode project from
the existing extension source, and Safari's WebExtension API coverage for
what this extension uses (storage, tabs, scripting, downloads-equivalent)
has grown reasonably close to parity — but this still requires a Mac,
Xcode, and for anything beyond a 7-day local test build, an Apple
Developer account ($99/year) plus notarization or App Store review.
- This is a categorically bigger and more platform-dependent lift than
  3a, and depends on hardware/tooling (a Mac) that may not even be
  available. Worth treating as optional and separate rather than bundled
  with "cross-browser support" generally.

**Recommendation:** Do **3a** as a single pass — cheap, and it's the
highest-reach move in this entire roadmap (Chrome alone dwarfs Firefox's
user base, so this is arguably the single highest-value item here for the
lowest cost). Treat **3b** as its own later decision, gated on whether
Safari is actually part of your daily use.

---

## Known limitations (deferred, not blocking)

- **Same-machine, multiple-browser filename collision.** Now that both
  Firefox and Chrome/Edge are supported, running the extension in two
  browsers on one machine means each has its own separate `storage.sync`
  data (sync doesn't bridge browsers — see item 1 above), but by default
  both still write their markdown export to the same
  `~/Downloads/tab-notes.md`, so whichever browser saves last overwrites
  the other's file. Fix would be trivial (a per-browser default filename
  in Options), but deliberately not done: most users, including the
  primary user of this extension, don't switch browsers often enough for
  this to matter in practice. Revisit if that changes.

## Suggested overall order

1. **3a (Chromium support)** — cheap, no architecture change, high reach.
2. **1A (`storage.sync`)** — cheap, no architecture change, solves the
   common "two of my own machines" case immediately. Be upfront that it's
   same-browser/same-account only and has a real size ceiling.
3. **2A (GitHub-based sharing)** — only if sharing is wanted soon; cheap
   relative to the alternative, reuses what's already set up.
4. **1B (GitHub-backed sync)** — once/if `storage.sync`'s ceiling actually
   bites.
5. **2B / 1C (real backend)** — a deliberate, separate decision, not a
   default next step from anything above. If it ever becomes worth doing,
   do it once for both sync and sharing rather than twice.
6. **3b (Safari)** — optional, gated on actually needing it.

## Open questions worth deciding before building

- For sharing: whole collection, individual entries, or by category? Who's
  the imagined audience — a handful of named collaborators, or genuinely
  the public?
- For sync: is "two of my own machines, same browser" actually the real
  need, or is cross-browser sync (Firefox laptop ↔ Chrome desktop) part of
  the ask? That alone rules out storage.sync as a long-term answer.
- How much history/volume is realistic? A few dozen entries a month looks
  very different, cost- and complexity-wise, than thousands accumulated
  over years.
