# Handoff — Sync id repair: after v5, and on every path that can reintroduce bad ids

**Date:** 2026-10-02
**Branch:** `0.1.2`
**Status:** implemented; `typecheck`, 454 tests, `lint`, `build` clean; dev-server log 0 errors.

## The report

The sync popover on production still showed *"Some local sample data needs a
one-time migration — reload the app to finish it."* A reload did not clear it.

## Root cause

The Dexie v5 upgrade remaps readable ids (`seed-note-0`) and only runs once per
version bump. Two paths could still put non-UUID values in front of the sync
engine afterwards:

1. **ZIP restore wrote ids verbatim.** `restoreFull()` bulk-puts `data.json`
   rows as they are, so restoring a backup exported before the migration
   reintroduced `seed-*` ids into an already-v5 database. No reload can ever
   fix that.
2. **Dangling references survived.** The migration mapped a reference only if
   the target row still existed. A note pointing at a deleted seed notebook —
   or an orphaned attachment / note-tag — kept its readable id, and every push
   of that row kept failing.

## The fix

- `remapNonUuidIds` now also **sanitizes**: a parent/notebook reference that
  still cannot be a UUID is cleared (`""`, i.e. root / unfiled); orphaned
  note-tags and attachments are dropped — none of it was ever on the server.
  It returns `{ remapped, sanitized }` and remains idempotent.
- `repairLocalIds()` runs the whole pass in **one transaction** so ids and
  references can never end up half-rewritten, and it is callable outside the
  upgrade (the upgrade itself is unchanged).
- **Sync self-heals**: a `uuid` syntax error triggers one repair per page load;
  if anything changed the status reads *"Repaired local data — reloading to
  finish."* and the app reloads once. If nothing could be repaired, the error
  now names the offending id instead of promising a reload that cannot help.
- **Restores normalize on the way in**: `restoreFull` runs `repairLocalIds`
  after writing, so an old archive can never reintroduce the problem.

No schema change; no new settings.

## Files

- `src/lib/db/migrate-ids.ts` — sanitizer + `repairLocalIds` + `RemapResult`
- `src/lib/db/migrate-ids.test.ts` — result shape, dangling/orphan case
- `src/lib/sync/trigger.ts` — `uuidErrorValue`, auto-repair, reload seam
- `src/lib/sync/trigger.test.ts` — parser + repair-wiring tests
- `src/lib/transfer/zip-import.ts` — repair after a full restore
- `src/lib/transfer/zip.test.ts` — pre-UUID archive re-keying round trip

## Verify

1. Open the app with a database that has readable ids; the first sync attempt
   should repair, show the reloading message, reload, and then sync cleanly.
2. Restore a ZIP exported before 2026-10-02; every id in IndexedDB should be a
   UUID afterwards and sync should push everything.
3. If a uuid error survives, the popover names the value — capture it and
   report; the repair has already done everything it knows how to do.
