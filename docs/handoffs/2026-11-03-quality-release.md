# 0.0.2 — correctness, performance, and hardening

- **Date:** 2026-11-03
- **Branch:** `0.0.2` (release commit; tagged `0.0.2` on `main`)
- **Status:** implemented and verified locally; the pgTAP suite has not been run
  here (no Supabase CLI on this machine)

## Why

An audit of correctness, security, performance, tests, dependencies and docs
found that the riskiest parts of the app were the ones the four gates could not
see: the save path had no test above the repository, the search index rebuilt
itself on every autosave, a share row never proved it owned its note, and the
first-run checklist counted a three-month-old export as "backed up".

This release is that list, in dependency order.

## What changed

### Version history is history again

`saveNoteContent` used to snapshot the previous state on every 800 ms autosave
and prune to 30, so the list was the last few minutes of typing and the 90-day
floor was unreachable. `src/lib/db/version-policy.ts` now decides: first edit,
a rename, or once every five minutes.

The same code had a latent wedge: a sync pull can move `notes.version`
backwards, and the history table has a unique `[noteId+version]` index, so the
next save inserted a duplicate key and **every later save failed**. Snapshot
numbers now come from `nextSnapshotVersion()` — the max of the note counter and
the history — so a collision is impossible. `restoreVersion` forces a snapshot
of the state it is about to replace.

Named versions (`createVersion`, "Save a version" in the history panel) are
kept regardless of age, capped at 100.

Sync conflict detection compared `JSON.stringify` of TipTap JSON against
Postgres `jsonb`, which reorders keys, so no-op pulls were classified as
conflicts and inflated history. `src/lib/sync/compare.ts` compares a canonical
form.

### Tag edits are visible immediately

`useInvalidate` invalidated `notes`, `note`, `notebooks`, `settings` and a
`search` key that no query registered — and omitted `tags`. With
`staleTime: Infinity`, tag chips, sidebar counts and the tag manager stayed
stale for the page lifetime. Every mutation now names the families it touched
(`QUERY_FAMILIES`), and an autosave patches the cached note rows instead of
refetching the list.

### The autosave hot path no longer scans the library

- `useSearch` reindexed the whole corpus on every query-cache event. Write
  paths now report changes through `src/lib/search/dirty.ts`; the worker
  applies incremental updates and serialises only when asked (debounced, and on
  `pagehide`). A `dataVersion` check on tab focus is the safety net for a
  missed marker.
- Titles, recent notes, live ids and notebook counts read compound indexes
  (`src/lib/db/repositories/note-index.ts`), not full rows. The trash badge is
  a count. The command palette fetches only when opened.
- `linkCounts` uses `sourceId`/`targetId` indexes instead of the whole
  `noteLinks` table.
- `@supabase/supabase-js` is a dynamic import. The `/notes` preload list no
  longer contains the GoTrue chunk (~105 KB gzip).

### Sync and share hardening

- An over-budget attachment used to throw out of `reconcile`, so notes and
  tags stopped syncing and every tick re-uploaded the rejected object. The
  attachment phase now pre-checks the budget, skips what cannot fit, and
  degrades to a warning (`SyncResult.warnings`, shown in the status popover).
  The adapter writes metadata before bytes and removes the row if the upload
  fails.
- New migration `supabase/migrations/20261103120000_ownership_hardening.sql`:
  - a trigger proving a share's note belongs to the share's owner;
  - `create_share` rejects a foreign note and passwords under 8 characters;
  - `get_shared_note` joins on the note owner and refuses trashed notes;
  - `has_password` generated column, so the bcrypt hash no longer reaches the
    browser;
  - the quota trigger covers `UPDATE`, without double-counting the row.
- `next.config.ts` adds nosniff, no-referrer, frame denial, a permissions
  policy, and a report-only CSP in production.

### Two small features

- **Print / PDF** at `/print/[noteId]`, reusing the standalone HTML renderer.
  The note menu opens it in a new tab.
- **Backup health** in Settings → Backup: last export, changes since, and
  "stale" once it is a week or 25 writes old. `GettingStartedCard` uses the
  same rule.

### Website and policies

The project site was rebuilt from scratch on the app's warm-paper palette: a
serif editorial hero with a browser-framed screenshot, a feature grid, a
privacy diagram, a self-host terminal, an FAQ, a full footer, and a responsive
header with a no-JavaScript mobile menu. It follows the system colour scheme,
uses system fonts only, and loads no scripts.

The policy set is now complete and internally linked:

- `website/privacy.html` — controller, hosting logs, local-only app, optional
  sync, share links, storage (including the companion's session flag), legal
  bases, GDPR/UK/CCPA/DPDP rights, transfers, a hosting-provider table,
  retention, children, changes, contact.
- `website/terms.html` — service, AGPL-3.0, data responsibility, acceptable use,
  share links, warranty, liability, copyright, governing law.
- `website/cookies.html` — no cookies; every localStorage/IndexedDB/Cache key,
  and how to clear it.
- `website/security.html` — private reporting, scope, safe harbour, practices.
- `website/accessibility.html` — WCAG 2.2 AA target, measures, known limits,
  feedback and enforcement.
- `website/legal.html` — operator, contact, licence/source, trademarks,
  jurisdiction, EU/UK and India notes, complaints.
- `website/404.html`, `robots.txt`, `sitemap.xml`,
  `.well-known/security.txt` and `.nojekyll`.

The app's Settings → About, the auth page, the public share viewer and the
README link the policies. The 404 uses root-relative `/sidenote/` asset paths so
it still styles correctly when GitHub Pages serves it at a deep path.

**Assumption to confirm:** the governing-law and operator sections say the
project is maintained from **India**, based on the maintainer's locale. If that
is wrong, change the jurisdiction in `terms.html` and `legal.html`. The pages
are written to be accurate for a free, individual open-source project, not as a
substitute for legal review; a dedicated privacy email or postal address should
be added before promoting the site in jurisdictions that expect one.

### Hygiene

- Removed the internal ops note and the superseded design snapshot; redacted
  host paths, deployment ids and the previous project name from the handoffs
  and the product plan. `npm run check:docs` (wired into CI) now fails on those
  patterns.
- `npm ci` + Node 26 in the README, `.nvmrc`, `.env`-style engine pin.
- Version and commit in Settings → About; releasing notes in CONTRIBUTING.
- Dropped unused `clsx`/`tailwind-merge`; `shadcn` moved to `dependencies`
  because `globals.css` imports its stylesheet, and AGENTS.md records why.
- The completion pass also fixed the stale "snapshot per save" README line, the
  `npx shadcn` instruction in the historical plan, the missing `.env.example`
  copy step, and the 0.0.2 changelog link reference.

## Verification

- `npm run typecheck`, `npm run test` (548 passed, 1 skipped), `npm run lint`,
  `npm run build`, `npm run check:docs` all green.
- `npm run dev` served `/`, `/notes`, `/settings`, `/trash`, `/auth`,
  `/s/<token>` and `/print/<id>` with no errors in the dev log. Interactive
  IndexedDB flows (typing, tag edit, backup, print dialog) were **not**
  exercised in a real browser in this session.
- Bundle check: the chunk containing `GoTrueClient` is not in
  `.next/server/app/notes.html`'s preload list.
- New tests: autosave (debounce, retry, unmount, stranded payload), search
  boot/incremental, dirty queue, mutation invalidation, version policy, manual
  version retention, lowered-version save, canonical compare, index-only reads,
  Dexie v6 upgrade, quota errors, backup health, attachment budget and
  resilience.
- `npm run test:db` was **not** run: the Supabase CLI is not installed here.
  The pgTAP suite is `supabase/tests/database/ownership.test.sql`; CI runs it
  for changes under `supabase/`, `src/lib/sync/` or `src/lib/share/`.
- **Self-hosters must apply `supabase/migrations/20261103120000_ownership_hardening.sql`
  before deploying this build.** `listShares` now selects the generated
  `has_password` column, so an un-migrated backend returns an error in the share
  dialog rather than a wrong value.

## Not done

- Released as 0.0.2 on 2026-11-03; the changelog carries a single 0.0.2
  section, and the tag and GitHub release point at the merge commit on `main`.
- KaTeX is still eager (~241 KB gzip). Deferring it needs a custom math node
  view; it was out of scope.
- The note list is still unvirtualised and "All notes" still reads full rows.
  The index work removes the metadata scans, not the list itself.
- Deferred by design: version-history sync, images in shared links,
  Markdown/Obsidian import, user-authored templates, conflict-surfacing UI.
- `docs/handoffs/2026-10-02-*` still mention a stack tag and container counts;
  they are historical notes, not current infrastructure.
