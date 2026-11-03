# M1 — Web Notes App (three-pane)

**Date:** 2026-09-29
**Workspace:** `/Users/Abhijith/RealWorldProjects/applywise` (wiped and rebuilt in place)
**Status:** implemented; the self-hosted backend is live (§13)
**Revision:** v3 — the filename is historical. Auth, LWW sync and public share
links shipped against self-hosted Supabase; the sections below that describe the
frontend-only phase are kept as the record of how it was built.

---

## 1. Goal

Delete the ApplyWise job-search app and replace it with a personal notes app:
a web-only knowledge base with a classic three-pane notes layout.

**No third-party app code is copied.** We build the interaction model from
scratch.

**This phase is frontend-only.** All data lives in the browser. The user's
self-hosted Supabase is wired in a later phase, when they say so.

### Non-goals (this phase)

Backend · auth · multi-device sync · real public share links · AI · MCP ·
plugins · diagram notes · mobile/desktop/extension clients.

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Location | Rebuild in `/Users/Abhijith/RealWorldProjects/applywise` |
| Approach | Fresh build, three-pane UX, no copied code |
| Data | **IndexedDB via Dexie v4.** No server, no auth, no env vars |
| Framework | Next.js 16 App Router + TypeScript strict + Tailwind v4 |
| UI kit | shadcn/ui + Radix primitives |
| Editor | TipTap v3 rich text **+** raw Markdown view |
| Auth | **None.** No login screen. Data is per-device |
| First run | Seeded sample notebooks + notes, one-click wipe |
| Hosting | Vercel Hobby, `*.vercel.app`, no environment variables required |

### Verified environment

Node `v26.8.2`, npm `11.19.1`, pnpm present, no bun, no global `shadcn`
(install via `npx shadcn@latest`).

Package versions resolved 2026-09-29:

```
next@16.3.7                    react@19.x
dexie@4.4.6                    jszip@3.10.2
@tiptap/react@3.31.3           @tiptap/markdown@3.31.3
minisearch@7.x                 cmdk
shadcn@4.21.0
```

`@tiptap/markdown@3.31.3` is first-party (backed by `marked`), so the Markdown
view is real serialization, not a lossy hand-rolled converter.

---

## 3. What changed from v1, and the cost

v1 targeted Supabase with email/password auth. That is deferred. Consequences:

| v1 item | v1 status |
|---|---|
| Postgres schema + RLS + migrations | **Deferred.** Nothing to apply yet |
| Supabase SSR auth, `/auth`, middleware redirect | **Cut.** No login screen, no middleware |
| Postgres full-text search + trigram | **Replaced** by a client-side index (§5.3) |
| Real-time sync across devices | **Cut.** Single device only |
| **Public share links `/s/[token]`** | **Impossible without a server** — see below |
| ZIP export/import | **Elevated** — it is now the only backup and transfer path |
| PWA offline *sync queue* | **Simplified** to app-shell caching; data was already local |
| Attachments in Supabase Storage | **Replaced** by Blobs in IndexedDB (§5.4) |

### 3.1 Public share links — the one real loss

A note living in this browser's IndexedDB **cannot be served to anyone else**.
There is no URL that resolves to it. This is a hard limitation of a
serverless frontend, not an implementation gap.

**Interim replacement (this phase):** export any note as a **single
self-contained HTML file** — styles inlined, images base64-embedded, opens in any
browser with no server. Share it by AirDrop/email/Drive, or drag it onto
Netlify Drop to get a public URL in about five seconds with no account.

**Deferred to the backend phase:** `/s/[token]` with optional password and
revocable links, served by the self-hosted Supabase instance.

### 3.2 Known debt — accepted deliberately

The user chose to build directly against Dexie with **no data-access
interface and no schema contract**, accepting rework at backend time. That was
a considered trade for speed. The specific exposure:

- Screens will call Dexie directly, so each one needs revisiting when the real
  backend lands.
- The relational shape is unproven. Risk areas: the notebook **cycle**
  prevention on re-parenting, `version` optimistic-concurrency semantics, and
  tag uniqueness (`lower(name)`) — Dexie has no `UNIQUE` constraint, so tag
  dedup is application-enforced and could drift.
- Mitigation for later: this plan's v1 §4.1 data model is still the target
  Postgres schema. Treat it as the contract to converge on, not as written law.

---

## 4. Data layer

### 4.1 Dexie schema (v1)

```
notebooks    ++id, parentId, position, updatedAt
notes        ++id, notebookId, isTrashed, updatedAt, isPinned
             &  [notebookId+isTrashed], &  [isTrashed+updatedAt]
tags         ++id, &name            (lowercased, app-enforced unique)
noteTags     ++id, noteId, tagId, &[noteId+tagId]
attachments  ++id, noteId, createdAt
versions     ++id, noteId, version, &[noteId+version]
searchIndex  key                   (serialized MiniSearch index)
settings     key                    (profile name, theme, lastNotebookId, seedVersion)
```

`contentJson` (TipTap doc) is the single source of truth. `contentMarkdown` and
`contentText` are derived and rewritten on every save.

`noteTags` is a separate join table rather than an array on `notes`, so it
matches the target Postgres shape and keeps tag deletion from rewriting note
rows.

### 4.2 Target Postgres schema (for the backend phase, not written yet)

Recorded here so the Dexie shape above converges on something real rather than
being invented twice:

```
profiles     display_name
notebooks    parent_id self-ref, name, position, deleted_at
notes        notebook_id, title, content_json, content_markdown, content_text,
             is_pinned, is_trashed, trashed_at, version,
             search_vector tsvector GENERATED (title A + content_text B) STORED
tags         UNIQUE (user_id, lower(name))
noteTags     (note_id, tag_id) PK
attachments  path, file_name, mime, size_bytes, width, height
versions     full snapshot per save
shares       token uuid UNIQUE, password_hash, expires_at, revoked_at
```

RLS on every table: `user_id = auth.uid()`. Attachments in a private bucket
with a `{user_id}/` path prefix, signed URLs only.

### 4.3 Version retention

Unbounded version snapshots will grow the database without limit. On write,
prune each note to the **last 30 versions**, and drop versions older than 90
days. Expose the cap in settings.

---

## 5. Notable implementation details

### 5.1 Framework shape

Every data-touching component is `"use client"`. There is no server data
fetching, so RSC is used only for layout and metadata. `middleware.ts` is not
needed — nothing to protect.

The app is effectively a client-side SPA inside a Next.js shell, so either
deployment target works. Vercel is chosen anyway: free, no env vars, and
already SSR-capable when the backend arrives.

### 5.2 Storage quota — the main technical risk

Images and attachments live as **Blobs in IndexedDB**, which is bounded by the
browser's origin quota. Under pressure the browser can evict the whole database
without warning. This is a real data-loss vector and gets explicit handling:

- Request `navigator.storage.persist()` on first run; surface the granted state
  in settings so the user knows whether data is evictable.
- Read `navigator.storage.estimate()` and show remaining quota in settings.
- Catch `QuotaExceededError` on every write and surface a real message — never
  a silent failure.
- Cap a single image at **5 MB after compression** and warn before accepting.
- **ZIP export is the user's only backup.** Say so in the UI, in the empty
  state, and in settings. Not buried in a menu.

### 5.3 Client-side search

Postgres FTS is unavailable, so: **MiniSearch** over `title` + `contentText`,
in a **Web Worker** so indexing never blocks typing. Prefix matching on.

The serialized index persists in Dexie, keyed by a data version counter, and is
rebuilt only when that counter changes — otherwise every page load pays the
full index cost.

### 5.4 Image compression

Canvas → WebP, longest edge **≤ 2560 px**, matching the app's existing
behaviour. Keep
the original if compression does not reduce size. Runs before the Blob is
written to IndexedDB.

### 5.5 Editor dual-view

`contentJson` is authoritative. The Markdown view calls `@tiptap/markdown`
`serialize` / `parse` against the same document. Round-trip is lossy for exotic
nodes — **we test it and document exactly what is lossy** rather than claiming
parity.

### 5.6 Autosave

Debounced 800 ms after the last keystroke, plus a flush on blur, on note switch,
and on `visibilitychange`. A `saving / saved / error` indicator is always
visible, because with local storage the user must be able to trust that a write
landed.

---

## 6. Routes

```
/                → redirect to /notes
/notes           three-pane workspace; state in ?notebook= &note= &q= &tag=
/trash           restore + purge
/settings        profile name, theme, version cap, storage usage, import/export
/print/[noteId]  print-optimised single note (PDF via browser print)
```

No `/auth`, no `/s/[token]`, no `/api/*`.

---

## 7. File tree

```
src/app/                     routes per §6
src/components/layout/       Workspace (3-pane), Sidebar, MobilePaneSwitch
src/components/editor/       Editor, Toolbar, MarkdownSource, BubbleMenu
src/components/notebooks/    NotebookTree (drag reorder), NotebookDialog
src/components/notes/        NoteList, NoteCard, SearchBar, TagPicker
src/lib/db/                  db.ts (Dexie schema), repositories/*.ts
src/lib/search/              worker.ts, index.ts
src/lib/tiptap/              extensions, markdown round-trip
src/lib/image/               compress.ts (WebP, ≤2560 px)
src/lib/transfer/            export-note.ts, export-zip.ts, import-zip.ts, enex.ts
src/lib/storage/             quota.ts, persist.ts
src/lib/seed/                sample data
src/hooks/                   queries.ts, mutations.ts  (TanStack Query v5)
docs/handoffs/               one note per phase
AGENTS.md                    rewritten for this codebase
```

## 8. Dependencies

Next 16 · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui + Radix ·
TipTap v3 (`react`, `starter-kit`, `extension-image`, `extension-placeholder`,
`extension-task-list/item`, `extension-link`, `markdown`) · TanStack Query v5 ·
Dexie v4 · MiniSearch · JSZip · `fast-xml-parser` (ENEX) · `cmdk` ·
Vitest + Testing Library.

---

## 9. Phases

Each phase ends with `npm run typecheck`, `npm run test` and `npm run build`
clean, plus a handoff note in `docs/handoffs/`.

| # | Phase | Done when |
|---|---|---|
| 0 | `git init`, wipe, scaffold Next + Tailwind + shadcn, new `AGENTS.md`, baseline handoff | `npm run build` green, history committed |
| 1 | Dexie schema, repositories, **sample data seed** + one-click wipe | seed renders; wipe leaves a clean empty app |
| 2 | Shell: theme, three-pane layout, responsive, mobile pane switcher, ⌘K scaffold | usable at 375 px width |
| 3 | Notebooks: nested tree, create/rename/delete, drag reorder, **cycle prevention** | deep nesting works; a notebook cannot become its own ancestor |
| 4 | Notes: list, sort, pin, bulk move/delete, note CRUD, trash + restore + purge | — |
| 5 | Editor: TipTap, toolbar, autosave, **Markdown view**, version history + restore | no keystroke lost on reload; history restores |
| 6 | Tags + tag filter + client-side search in a worker | prefix search matches; typed search never drops a frame |
| 7 | Attachments: paste, drag-drop, WebP compress, Blob storage, quota handling | quota errors surface honestly |
| 8 | Export/import: single note MD + HTML + print, full ZIP, ZIP import, ENEX import | exported ZIP re-imports to an identical note tree |
| 9 | Self-contained HTML share file + Web Share API | exported file renders standalone, images intact |
| 10 | PWA: manifest, app-shell caching, `storage.persist()`, focus mode, dark mode | installs; relaunches offline |
| 11 | Test suite, polish, Vercel deploy, custom domain | live on `*.vercel.app` with a green build |

### Risk notes

- **P1–P2** cycle prevention in the notebook tree. A recursive move that
  re-parents a notebook under its own descendant orphans the whole subtree. Needs
  an explicit ancestor walk, plus a test.
- **P5** version snapshots without the retention cap in §4.3 will grow the
  database without limit.
- **P6** rebuilding the MiniSearch index on every load is the obvious slow path.
  Persist it, rebuild only on a version-counter change.
- **P7** IndexedDB eviction is silent and total. §5.2 is not optional polish.
- **P8** ZIP export is the user's only backup. Its fidelity is the single most
  important test in the milestone.
- **P9** self-contained HTML embeds images as base64 — size grows ~33%. A
  note with many photos produces a large file. Cap and warn.

---

## 10. Verification gates

`npm run typecheck` · `npm run test` · `npm run build` — all clean before any
phase is called done.

Manual checks:

- **P0** first commit exists; a fresh `npm ci && npm run build` works from clean
- **P1** seed loads with notebooks, tags, images, code blocks; "delete samples" empties everything
- **P3** drag-reorder persists across reload; a notebook cannot be dropped into its own subtree
- **P4** bulk move and bulk delete both undo correctly; trash restore returns the note to its original notebook
- **P5** Markdown → rich text → Markdown preserves headings, lists, code, links, images
- **P6** search matches a word prefix; results render snippets with the hit highlighted
- **P7** a 4000 px image stores as WebP ≤ 2560 px; filling the quota shows a real error
- **P8** exported ZIP re-imports into a second profile with an identical note tree
- **P9** the standalone HTML file opens offline in a private window with images intact
- **P10** installed PWA relaunches with no network
- **P11** deployed URL loads, and a reload does not lose unsaved editor state

---

## 11. Destructive deletion — nothing is backed up

The repo is **not** a git repository, so the wipe is unrecoverable. The user
chose hard delete. Permanently lost:

```
app/  src/  next.config.ts  tsconfig.json  tsconfig.tsbuildinfo
package.json  package-lock.json  vitest.config.ts  postcss.config.mjs
next-env.d.ts  .kilo/  .next/  node_modules/
AGENTS.md  CHANGELOG.md  README.md
job_application_tracker_product_plan.md      ← 40 KB, unrecoverable
docs/handoffs/*.md                            ← 3 notes, unrecoverable
```

`node_modules/` and `.next/` regenerate. The product plan and 3 handoff notes do
not. `AGENTS.md` is rewritten from scratch, not carried over. Phase 0 runs
`git init` **first**, so this cannot recur.

---

## 12. Hosting and domain

### Vercel Hobby — confirmed

| Limit | Value |
|---|---|
| Fast data transfer | 100 GB / mo |
| Function invocations | 1 M / mo |
| Edge requests | 1 M / mo |
| Active function CPU | 4 CPU-hr / mo |
| Deployments | 100 / day, 50 per project |
| Custom domains | 50 per project, free, auto-HTTPS |
| Preview deploys | Yes, per push |

**Zero environment variables** — there is no backend, so nothing to configure
and no secret to leak into the client bundle. Connect the GitHub repo, deploy.

Hobby is **non-commercial personal use only**. Fine here; a constraint if this
is ever monetized.

**Runner-up:** Cloudflare Pages — also free, but Next.js SSR there needs the
OpenNext adapter. No gain for a client-side app.

### GitHub Pages — rejected, not merely less pleasant

GitHub Pages has no Node runtime, forcing `output: 'export'`, which hard-fails
on:

```
ExportError: Server Actions are not supported with static export
Middleware cannot be used with "output: export"
Page "/s/[token]" is missing "generateStaticParams()"
images.unoptimized: true required
```

Today the app would technically survive that. But the backend phase is coming,
and Pages would then block SSR auth, server actions, and dynamic share-link
metadata — forcing a rewrite. Vercel costs nothing and stays out of the way.

### Domain

**Start free on `*.vercel.app`** — real domain, automatic HTTPS, zero setup.

Adding a real domain later is a dashboard click: add it in Vercel, point a
CNAME at `codeload.vercel.app`. **No code change, no redeploy.** So there is no
reason to buy one now.

| Option | Cost | Notes |
|---|---|---|
| **Cloudflare Registrar** | at cost (`.com` ≈ $10/yr) | **Recommended.** No markup, free WHOIS privacy |
| Porkbun / Dynadot | ≈ $10–15/yr | Common `.com`/`.dev` promos |
| `eu.org` subdomain | free | Manual approval, **weeks to months** |
| `pp.ua` subdomain | free | SMS activation, yearly re-delegation |
| DuckDNS | free | Instant, 30-day token refresh, reads as a dev URL |
| ~~Freenom (.tk/.ml/.ga)~~ | — | **Dead. Never register here.** |

Avoid cheap first-year `.xyz`/`.top` promos — renewal is 5–10× the first year.

---

## 13. Backend phase (later, user-gated)

**Phase 1 done 2026-10-02** — dedicated stack provisioned and initial schema
applied. Runbook: `docs/SELF-HOSTING.md`. Handoff:
`docs/handoffs/2026-10-02-backend-phase-1-stack-and-schema.md`.

1. ✅ `supabase/migrations/20261002191500_initial_schema.sql` — the §4.2
   schema with RLS on every table.
2. ✅ Isolation proven by `supabase/smoke.sh` (cross-user insert → 403, anon →
   0 rows). Remaining steps:
3. Add `@supabase/ssr`, cookie sessions, `/auth`, and a middleware redirect.
4. Move repositories from Dexie to Supabase. A **first-run importer** migrates
   existing browser data, or the ZIP export/import path is reused.
5. Real `/s/[token]` share links with optional password and revocation.
6. Self-hosted specifics: set `SITE_URL` and redirect URLs on the instance,
   allow the Vercel origin in CORS, and point `NEXT_PUBLIC_SUPABASE_URL` at the
   self-hosted host rather than `supabase.co`.
7. The PWA offline outbox (deferred from v1) becomes meaningful only here.
