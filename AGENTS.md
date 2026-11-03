# AGENTS.md — Sidenote (web)

This file is auto-loaded by agent tools at session start. It is the onboarding
contract for any agent working in this repo. Read it fully, then read the most
recent handoff note in `docs/handoffs/` before starting work.

> **Do not write the Next.js managed-block marker literally in prose anywhere in
> this file.** `next dev` scans for those exact comment strings and rewrites the
> region between them. Referring to it as "the Next.js managed block" is safe;
> pasting the comment syntax is not — it silently deletes surrounding sections.

## Project at a glance

- A personal, **local-first** notes and knowledge base. Web only.
- A classic three-pane notes layout. **No third-party app code is copied.** We
  build the interaction model, not the codebase.
- **Next.js 16 (App Router)**, React 19, TypeScript strict, Tailwind v4.
- **Local-first.** All data lives in the browser (IndexedDB via Dexie). With no
  env vars there is no server and no account. Setting the two optional
  `NEXT_PUBLIC_SUPABASE_*` vars enables sign-in and sync against the
  self-hosted stack; every remote path degrades to a no-op without them.
- Routes: `/` (redirects to `/notes`), `/notes`, `/trash`, `/settings`,
  `/auth` (optional sign-in), `/s/[token]` (public share links).
- The product plan is `docs/plans/frontend-only-m1.md` (the filename is
  historical: the self-hosted backend is live — see §13).
- Licensed **AGPL-3.0**. `main` is protected; changes land through pull
  requests with a green CI run. See `CONTRIBUTING.md` and `SECURITY.md`.

## Build & verify

```bash
npm install                 # npm 11 script allowlist is in package.json#allowScripts
npm run typecheck           # next typegen && tsc --noEmit
npm run test                # vitest run
npm run lint                # eslint
npm run dev                 # next dev (http://localhost:3000)
npm run build               # next build
```

**All four of `typecheck`, `test`, `lint` and `build` must be clean before any
phase is called done.**

`npm run typecheck` runs `next typegen` first because `LayoutProps<>` and
friends are generated globals — a bare `tsc --noEmit` on a cold `.next/` fails
with `Cannot find name 'LayoutProps'`.

**Those four gates are necessary, not sufficient.** Every one of them passed on
a build that then threw at runtime. Anything client-side must also be exercised
with `npm run dev` and the log in `.next/dev/logs/next-development.log` read.

## Stack

- Next.js 16.3, React 19.2, TypeScript 5, Tailwind CSS 4.
- shadcn/ui on **Radix** primitives, `style: radix-nova` preset, neutral base.
  `cn` is imported from the `cn` package (`src/lib/utils.ts` re-exports it) —
  it is a compiled clsx + tailwind-merge replacement, **not** a local helper.
- TipTap v3 for the editor, with `@tiptap/markdown` for the raw-Markdown view.
- TanStack Query v5 for client state, Dexie v4 for storage, MiniSearch for
  search, JSZip for transfer, `cmdk` for the command palette.

## Architecture map

- `src/app/` — routes. `/` is a redirect; everything else is a client surface.
- `src/components/ui/` — shadcn primitives. **Do not hand-edit**; re-run
  `shadcn add <name> --overwrite` instead.
- `src/components/layout/`, `editor/`, `notebooks/`, `notes/`, `share/` —
  feature components.
- `src/lib/db/` — Dexie schema and repositories. **The only place that talks to
  IndexedDB.**
- `src/lib/` — `tiptap/`, `search/`, `image/`, `transfer/`, `storage/`,
  `seed/`, `supabase/` (browser auth client + store), `sync/` (LWW reconcile
  engine, Supabase adapter, trigger).
- `src/hooks/` — `queries.ts` (TanStack Query read hooks) and `mutations.ts`
  (write hooks). Components call hooks, never Dexie directly.
- `supabase/migrations/` — Postgres schema + RLS, applied with the Supabase CLI
  (`docs/SELF-HOSTING.md`).
- `docs/handoffs/` — one note per phase, newest last.

## Non-negotiable invariants

- **Everything that touches IndexedDB is `"use client"`.** There is no server
  data layer in this phase. RSC is used only for layout and metadata.
- **A `<script>` rendered as JSX children throws in React 19.** Render the
  inline theme script with `dangerouslySetInnerHTML` (see `THEME_INIT_SCRIPT`
  in `src/app/layout.tsx`). `next/script` with `strategy="beforeInteractive"`
  also renders a real script into the React tree and fails the same way.
- **Never set state synchronously in an effect body.** The React Compiler lint
  rule (`react-hooks/set-state-in-effect`) rejects it. Reset from the event
  handler, or derive the value with `useMemo` / during render instead.
- **`contentJson` (the TipTap doc) is the single source of truth.**
  `contentMarkdown` and `contentText` are derived and rewritten on every save.
  Never read them as authoritative.
- **`src/lib/db/` is the only module that imports Dexie.** Screens go through
  repositories. This is what makes the backend swap possible.
- **The database layer never derives content.** `createNote` accepts
  `contentMarkdown` / `contentText` as arguments rather than serialising them,
  because `src/lib/db/` must not depend on the editor. Any caller creating a
  note *with a body* must pass them, or search and previews stay empty until
  the first autosave.
- **IndexedDB rejects `null` and `boolean` as keys.** Booleans are stored as
  `0 | 1`; nullable foreign keys are stored as `""`. Everything crossing the
  boundary goes through `src/lib/db/convert.ts`. Do not write a table directly.
- **Storage is evictable.** The browser can wipe IndexedDB under pressure with
  no warning. Always request `navigator.storage.persist()`, surface
  `navigator.storage.estimate()` in settings, and catch `QuotaExceededError` on
  every write. Never let a write fail silently.
- **ZIP export is the user's only backup.** Surface it prominently — empty
  state, settings, and the trash view. Do not bury it.
- **Notebook trees must not form cycles.** Any re-parent walks ancestors first
  and refuses a move that would place a notebook inside its own subtree.
- **Version history is capped** (last 30 per note, plus a 90-day floor). Prune
  on write or the database grows without limit.

## Conventions & gotchas

- **npm 11 rejects `--allow-scripts` in project installs.** If a tool shells out
  to `npm install` and dies with `EALLOWSCRIPTS`, it is running under `npx`,
  which injects `npm_config_*` from `~/.npmrc`. Run the CLI **globally**
  (`npm i -g shadcn@latest`) instead of via `npx`. This bit both
  `create-next-app` and `shadcn init`.
- Native packages needing postinstall are allowlisted in
  `package.json#allowScripts` (`@tailwindcss/oxide`, `esbuild`, `fsevents`,
  `sharp`, `unrs-resolver`). Adding a dependency that needs a build script means
  adding it there too.
- `next.config.ts` pins `turbopack.root` to the project dir. Without it
  Turbopack walks up to `$HOME` and warns about an unrelated `pnpm-lock.yaml`.
- The `shadcn` CLI prompts even with `--yes`; pass `--no-reinstall` to `init`
  to avoid a hang.
- `@types/node` must stay `^26` to match the Node 26 runtime and satisfy
  vitest 5's peer range. vitest 3 has a published path-traversal advisory —
  do not downgrade.
- Tests use `fake-indexeddb` (loaded in `vitest.setup.ts`), so Dexie code is
  testable without a browser. Note it degrades `Blob` to a plain object, which
  is why attachments store `Uint8Array`.
- **StarterKit v3 already bundles Link, Underline and HorizontalRule.** Adding
  any of them separately produces `[tiptap warn]: Duplicate extension names
  found` — a warning today, a schema bug tomorrow. Configure them through
  `StarterKit.configure(...)`, and **check its bundled list before adding any
  node extension.** This has bitten three times: Link/Underline in Phase 5,
  HorizontalRule in the toolbar work, and again when weighing syntax
  highlighting (`@tiptap/extension-code-block-lowlight` *replaces* the bundled
  `codeBlock`, it does not sit beside it).
- **Dexie's `transaction()` takes at most six table arguments** — pass an
  array. A seventh is a runtime `SubTransactionError` that `tsc` cannot catch.
  Every table a transaction body writes to must also be declared, including
  ones a called function touches.
- **Never re-derive ProseMirror document positions by hand.** Use
  `state.doc.resolve(pos)` and `$pos.parentOffset`. Walking the document and
  adding offsets is how the wiki-link decoration ended up covering `[Roof]] `
  instead of `[[Roof]]`; the root node's children start at 0, not 1. When a
  position drives a deletion, assert by performing the deletion.
- **The dev-server log keeps stale errors** from intermediate edit states.
  After a fix, `rm -rf .next/dev` and restart before believing one.
- `next dev` rewrites the Next.js managed block at the end of this file on every
  run. That is expected. Commit it with your work; the danger is only in
  *writing* the marker literal, per the warning at the top.
- Next 16 breaking changes that do *not* affect us, for the record: async
  request APIs (`params`/`searchParams` are Promises — we read search params
  client-side), and `middleware` → `proxy` (we have no auth). The full list is
  in `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.

## Testing

- Vitest + Testing Library. `npm run test`.
- Pure logic (markdown round-trip, compression, notebook tree ops, import
  parsers) is where tests earn their keep. Cover the invariants above first.
- jsdom lacks `matchMedia`, `ResizeObserver` and `IntersectionObserver`; all
  three are stubbed in `vitest.setup.ts`.
- **Never use the object a mutating call returned** — `createNote` returns a
  snapshot that is stale the instant you save into it. Use the return value of
  the *last* write, or re-read through a repository. This has bitten the
  export tests twice and the notebook tests once.
- `Date.now()` has millisecond resolution. Tests that assert on time ordering
  need a stepped clock or they are a coin flip.
- Name test helpers `withX`, not `useX` — the react-hooks lint rule flags
  anything that looks like a hook.

## What is deferred (do not build yet)

- **Backend.** A self-hosted Supabase stack is supported (guide:
  `docs/SELF-HOSTING.md`). Auth, LWW sync for notebooks, notes, tags and
  note-tags, attachment byte sync with a 50 MB free budget, and public share
  links (`/s/[token]`) are implemented. Still open: version-history
  sync, images inside shared links, and multi-device *live* push (sync is
  reconcile-on-focus/interval, not Realtime).
- **Public share links** (`/s/[token]`) — implemented with optional password,
  expiry and revocation. Images inside a shared note still render as a
  placeholder; the public viewer has no access to the sharer's attachment bytes
  yet.
- AI features, MCP, plugins, diagram notes, mobile/desktop/extension clients,
  multi-account admin.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
