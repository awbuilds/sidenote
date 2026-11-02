# Handoff — Phase 6: tags and search

**Date:** 2026-09-30
**Status:** complete — `typecheck`, `test` (118), `lint`, `build` green; worker chunk confirmed emitted

## What exists now

```
src/lib/search/engine.ts   MiniSearch wrapper: buildDocs, search, toHits, snippetFor
src/lib/search/worker.ts   the worker: index / restore / query / clear
src/lib/search/engine.test.ts  13 tests
src/hooks/useSearch.ts     worker lifecycle, index persistence, query dispatch
src/hooks/useTags.ts       useTagFilter, useTagSummaries, useTaggedNoteIds
src/components/notes/SearchResults.tsx  highlighted snippets
src/components/notes/TagSection.tsx       sidebar tag filter
```

The note list now has three sources behind one row component: search results
(ranked, highlighted), a tag filter, or the notebook listing. A notebook
selection narrows all three rather than being replaced by them.

## Schema v2

Added the `searchIndex` table. Followed the append-only rule from `AGENTS.md`
rather than editing `stores()` in place — which also means the migration path
is now exercised on every fresh database. `db.test.ts` runs against it, so a
broken upgrade fails the suite rather than the app.

`SearchIndexRow` stores the serialized MiniSearch plus the `settings.dataVersion`
it was built from. On load the index is **restored only when the version still
matches**, and rebuilt otherwise. Without that check every page load would pay
the full indexing cost.

## Search behaviour

- `prefix: true` — typing "data-in" finds "Data-Intensive" before the word is
  finished. This is what makes it feel responsive.
- `boost: { title: 3 }` — a title hit outranks a body hit. Tested.
- `fuzzy: 0.2` — tolerates a typo without going loose.
- The worker serialises its own index and posts it back on `ready`; the main
  thread persists it. Only the worker holds the live MiniSearch, so asking it
  is the only correct way to serialise.

## Derived state, not stored state

`useSearch` no longer keeps `isSearching` or a "clear results when the query is
empty" flag. Both are derived:

- `hits` is `query.trim() === "" ? [] : hits` at the return site
- the query effect's body does **no synchronous setState** — it only posts to
  the worker, and `setHits` happens in `onmessage`

That was forced by `react-hooks/set-state-in-effect`, but it is genuinely
better: there is no way for the two to disagree.

Stale responses are discarded by comparing a monotonic request id in
`onmessage`, so a slow reply to "wo" cannot overwrite results for "work".

## Turbopack and workers

`new Worker(new URL("../lib/search/worker.ts", import.meta.url))` is bundled
correctly — the worker chunk is emitted, and the MiniSearch code is present in
`.next/static/chunks/`. Verified by inspecting the build output, since the
server-rendered page never exercises it.

## Not verified

**Search has never been typed into.** The engine, prefix matching, ranking,
serialisation and snippet windows are all unit-tested, and the worker bundles —
but the round trip through `Worker`, and the highlight rendering, are untested
in a browser.

## Next up

**Phase 7 — attachments.** The `Image` extension is already registered and
waiting. Paste, drag-drop, WebP compression, and honest quota errors.
