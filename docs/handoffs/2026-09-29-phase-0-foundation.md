# Handoff — Phase 0: project foundation

**Date:** 2026-09-29
**Status:** complete — `typecheck`, `test`, `lint`, `build` all green

## What happened

The previous app in this folder was deleted in full and
replaced with a local-first web notes app. The old tree, its 40 KB product
plan, and its three handoff notes are **gone and unrecoverable** — the folder
had no git history. `git init` ran before the wipe so that cannot recur.

## What is set up

- Next.js 16.3.7 (App Router, Turbopack), React 19.2.8, TypeScript 5, Tailwind v4.
- shadcn/ui on Radix, `radix-nova` preset, neutral base colour, light + dark
  themes already tokenised in `src/app/globals.css`.
- 20 shadcn components in `src/components/ui/` — button, input, textarea, input-group,
  label, checkbox, switch, dialog, alert-dialog, sheet, popover, dropdown-menu,
  tooltip, scroll-area, separator, tabs, badge, skeleton, select, command, sonner,
  collapsible.
- Full dependency set for the milestone: TipTap v3 (+ `markdown`), TanStack
  Query v5, Dexie v4, MiniSearch, JSZip, `fast-xml-parser`, `fake-indexeddb`.
- Vitest 5 + Testing Library with a `vitest.setup.ts` that stubs `matchMedia`,
  `ResizeObserver`, `IntersectionObserver` and loads `fake-indexeddb`.
- `AGENTS.md` written for this codebase.
- Routes stubbed: `/` redirects to `/notes`; `/notes` is a placeholder until
  Phase 2.

## Environment gotchas — read these, they cost time

1. **npm 11 + `npx` breaks CLI installers.** `EALLOWSCRIPTS: --allow-scripts is
   not allowed in project-scoped installs`. Cause: `npx` injects
   `npm_config_*` env vars derived from `~/.npmrc` (which sets
   `allow-scripts=@anthropic-ai/claude-code`) into the child, and npm 11 throws
   when a CLI/env-level allow-scripts is present. This broke both
   `create-next-app` and `shadcn init`.
   **Fix:** install CLIs globally and run them directly —
   `npm i -g shadcn@latest` then `shadcn init ...`. Not via `npx`.
2. **`shadcn init` ignores `--yes`** for the "re-install existing UI
   components?" prompt. Pass `--no-reinstall` or it hangs.
3. **`npm run typecheck` must run `next typegen` first.** `LayoutProps<>`, which
   the root layout uses, is a generated global. A bare `tsc --noEmit` against a
   cold `.next/` fails. The script is `next typegen && tsc --noEmit`.
4. **`turbopack.root` is pinned** in `next.config.ts`. Without it Turbopack walks
   up to `$HOME` and warns about an unrelated `pnpm-lock.yaml` on every build.
5. **vitest 3 carries a published advisory** (path traversal via
   `@vitest/mocker`). Upgraded to vitest 5, which required `@types/node` `^26`
   to match the Node 26 runtime. `npm audit` is clean. Do not downgrade either.
6. `src/lib/utils.ts` re-exports `cn` from the **`cn` npm package** — a compiled
   clsx + tailwind-merge replacement that shadcn 4.21 installs. It is not a
   hand-rolled local helper. `globals.css` imports `shadcn/tailwind.css`, which
   resolves through that package's exports map.

## Next up

**Phase 1 — data layer.** `src/lib/db/`: Dexie schema, typed repositories, and
the sample-data seed with a one-click wipe. No UI work yet. The invariants in
`AGENTS.md` (cycle prevention, quota handling, `contentJson` as source of truth)
are all Phase 1 concerns and should be built with their tests, not retrofitted.
