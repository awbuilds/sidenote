# Handoff — Phase 2: app shell

**Date:** 2026-09-29
**Status:** complete — `typecheck`, `test` (71), `lint`, `build` all green, verified in `next dev`

## What exists now

Routes: `/` (redirect), `/notes` (workspace), `/trash`, `/settings`.

```
src/lib/theme.ts                     light/dark/system, resolve + apply, pre-paint script
src/lib/format.ts                    relativeTime, preview, formatDateTime
src/components/providers.tsx         TanStack Query + theme + tooltip + toaster
src/components/providers/theme-provider.tsx
src/hooks/useBootstrap.ts            seed on first load, request persistence, error state
src/hooks/queries.ts                 useSettings, useNotebookTree, useNotes, useTrashedNotes
src/hooks/query-keys.ts              centralised keys
src/hooks/useWorkspaceParams.ts      URL state: ?notebook=&note=&q=&tag=
src/components/layout/Workspace.tsx        three-pane composition
src/components/layout/EditorPane.tsx       read-only note preview (Phase 5 replaces it)
src/components/layout/MobilePaneHeader.tsx back button + pane visibility
src/components/layout/StorageStatus.tsx    eviction risk, always visible
src/components/layout/ThemeToggle.tsx
src/components/layout/WorkspaceSkeleton.tsx shared by page + Suspense fallback
src/components/notebooks/NotebookTree.tsx  read-only tree with counts
src/components/notes/NoteListPane.tsx       read-only list with search
```

## The three-state notebook problem

`listNotes` distinguishes `undefined` (every note) from `null` (unfiled only),
but the URL can only express "absent" or "=something". So:

- absent `?notebook=` → `notebookFilter === undefined` → all notes
- `?notebook=unfiled` → `notebookFilter === null` → unfiled notes only
- `?notebook=<uuid>` → that notebook

`UNFILED` is a reserved sentinel in `useWorkspaceParams.ts`; a real id is a
UUID so it cannot collide. An earlier draft used `"__all__"` for "all notes",
which conflated absent with unfiled — fixed before it shipped.

## Two runtime bugs the dev server caught

Neither showed up in typecheck, lint, tests or build. Both only appeared by
actually running the app:

1. **`useCallback is not defined`** — a `sed`-applied import fix had not
   actually landed before the page was requested.
2. **"Encountered a script tag while rendering React component"** — React 19
   refuses to render a bare `<script>` from inside a component tree. The
   no-flash theme script must be `next/script` with
   `strategy="beforeInteractive"`. This is now an invariant in `AGENTS.md`.

Lesson: for anything client-side, `npm run build` is not verification. Start
`next dev` and read the log.

## React Compiler lint rules are on

`react-hooks/set-state-in-effect` rejects synchronous `setState` in an effect
body. Three real cases, all fixed by restructuring rather than suppressing:

- **`useBootstrap`** — the `retry` reset moved into the click handler; the
  effect body now only does async work.
- **`ThemeProvider`** — `resolved` is derived with `useMemo` from `theme` +
  `systemDark` instead of being stored; the effect only touches the DOM. The
  stored theme is read in a lazy `useState` initialiser so the first render
  already agrees with the pre-paint script.
- **`Workspace` pane state** — was syncing `pane` to `params.noteId` in an
  effect. Now derived: `paneOverride ?? (noteId ? "editor" : "notes")`, with
  clicks as the only override. The URL is the source of truth.

`MobilePaneHeader`'s `useActivePane` was deleted — its effect only reset state
to the value it already had.

## Not built yet (by design)

- **Phase 3** — notebook create/rename/delete and drag reorder. `NotebookTree`
  is read-only; `moveNotebook`/`reorderNotebooks` are tested but unwired.
- **Phase 4** — note CRUD, bulk select, trash actions. `/trash` lists but has no
  restore/purge buttons.
- **Phase 5** — TipTap. `EditorPane` renders `contentText` in a `<pre>`.
- `mutations.ts` does not exist yet; no write hooks.
- `NoteListPane` filters with naive `includes`. Phase 6 replaces it with the
  MiniSearch index.
- Profile name is read in the sidebar but has no editing form.
- StorageStatus is rendered in the sidebar; it needs re-checking on write, not
  just on mount.

## Verification done

- `next dev` on :3000, `/notes` returns 200, no errors in the dev log.
- Confirmed the theme script and seed IDs reach the client.
- **Not verified interactively** — no browser was attached to the session, so
  pane switching, theme toggle and the 375px layout have not been clicked
  through. Do that before trusting the responsive behaviour.

## Next up

**Phase 3 — notebooks.** Create/rename/delete, drag reorder, and the cycle
guard surfaced in the UI. `moveNotebook` already refuses invalid moves at the
repository level; the UI needs to surface that refusal as a message rather than
letting a drop fail silently.
