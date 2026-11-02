# Handoff — Phase 1: data layer

**Date:** 2026-09-29
**Status:** complete — `typecheck`, `test` (71 passing), `lint`, `build` all green

## What exists now

```
src/lib/db/
  types.ts        domain + row types, AppSettings, sentinel helpers
  db.ts           Dexie subclass, singleton, schema v1
  convert.ts      domain <-> row converters (the only place that knows the difference)
  tree.ts         pure tree logic: build, cycle detection, descendants, reindex
  test-helpers.ts withTestDb()
  repositories/   notebooks.ts, notes.ts, tags.ts, attachments.ts, settings.ts
  *.test.ts       31 tests
src/lib/storage/quota.ts    persist request, estimate, QuotaExceededError handling
src/lib/image/compress.ts   WebP re-encode, longest edge <= 2560
src/lib/seed/               builders.ts, seed.ts, seed.test.ts
```

## Three IndexedDB landmines we hit

These are the reason `types.ts` and `convert.ts` exist. Each one silently
breaks queries rather than throwing at the right moment, so they are worth
remembering.

**1. Booleans are not valid IndexedDB keys.** A boolean column cannot be
indexed at all. `isPinned` / `isTrashed` are persisted as `0 | 1` (`Flag`) and
surfaced as booleans on the domain `Note`.

**2. `null` is not a valid IndexedDB key either.** This one cost the most. A
root notebook has `parentId: null`, which means `where("parentId").equals(null)`
throws `Invalid key provided`. Nullable parents are now persisted as `""` via
`toStorageId` / `fromStorageId`, and `ROOT` in `types.ts` is the sentinel.
`listNotes({ notebookId: null })` now goes through the same composite index
instead of a JS filter.

**3. Dexie's `transaction()` takes at most six table arguments.** Passing
seven throws. Where more tables are needed, pass an array as a single argument
(see `deleteNotebook`).

## Design decisions worth keeping

- **`contentJson` is authoritative.** `contentMarkdown` and `contentText` are
  derived on every write. The seed hand-writes them; the editor's real
  serialisation lands in Phase 5.
- **Version snapshots hold the state *before* the save.** So `versions` for a
  fresh note is empty until the first content write, and restoring is itself a
  new version — history is never destroyed by restoring.
- **Retention prunes on write**, inside the save transaction: last 30 per note
  plus a 90-day age floor. Tested both ways.
- **`removeSampleData()` leaves `seeded: true` on purpose** — deleting the
  samples is a decision, and a reload must not undo it. `wipeAllData()` clears
  settings too, so a full reset does re-seed.
- **`buildNotebookTree` recovers from corrupt data.** A dangling `parentId` is
  treated as a root; a cycle is broken at detection; anything trapped in a cycle
  is promoted to a root in a second pass so no notebook can silently vanish.
  The first version of this made a 2-cycle produce an *empty* sidebar — the
  test caught it.
- **Tag dedup is application-enforced** (`lower(name)`), because Dexie has no
  unique-constraint analogue. `createTag` re-reads after a failed `add` to cover
  the race.

## Testing notes

- `fake-indexeddb/auto` in `vitest.setup.ts` makes the whole data layer
  testable in Node.
- `withTestDb()` (not `useTestDb`) gives each test a uniquely named database,
  then deletes it. Renamed because eslint's react-hooks rule flagged the
  `use` prefix.
- **Never assert on the object a mutating call returned** — it is a snapshot and
  goes stale. Several early failures were exactly this; tests now re-read via
  `listNotebooks()` / `getNote()`.
- `Date.now()` has millisecond resolution, so "most recently trashed first"
  needs a stepped clock (`vi.spyOn(Date, "now")`) or it is a coin flip.

## Not built yet (by design)

- TanStack Query hooks (`src/hooks/`) — Phase 3. Screens must go through
  repositories, but nothing renders a note yet.
- Markdown serialisation from TipTap — Phase 5.
- The search index — Phase 6. `dataVersion` already bumps on every content
  write, which is what the index will key off.
- Image compression has no test yet (jsdom has no `createImageBitmap`) — it
  lands with attachments in Phase 7.
- `src/lib/db/convert.ts` is exported but `notes.ts` re-exports
  `fromNoteRow` / `toNoteRow` directly; drop the alias if it proves unused.

## Next up

**Phase 2 — shell.** Theme toggle wired to settings, the three-pane layout,
responsive down to 375px, and a mobile pane switcher. This is the first phase
that renders data, so it is where the repository layer gets its first real
exercise.
