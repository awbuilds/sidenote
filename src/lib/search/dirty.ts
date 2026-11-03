import type { NoteId } from "@/lib/db/types";

/**
 * What the search index needs to catch up on.
 *
 * The hook used to reindex whenever TanStack Query reported a `notes`/`note`
 * change. That fired on every autosave, and the rebuild read the whole library
 * and wrote the whole serialised index back — per typing pause. Write paths
 * now report what changed instead: a note id, a removal, or "rebuild
 * everything" for imports and wipes.
 */
export type SearchWork =
  | { kind: "full" }
  | { kind: "incremental"; ids: NoteId[]; removed: NoteId[] };

let full = false;
const dirty = new Set<NoteId>();
const removed = new Set<NoteId>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** A note was created or its content/title changed. */
export function markSearchDirty(ids: NoteId[]): void {
  if (ids.length === 0) return;
  for (const id of ids) {
    dirty.add(id);
    removed.delete(id);
  }
  notify();
}

/** A note was purged, or trashed and must leave the live index. */
export function markSearchRemoved(ids: NoteId[]): void {
  if (ids.length === 0) return;
  for (const id of ids) {
    removed.add(id);
    dirty.delete(id);
  }
  notify();
}

/** Imports, seeds, wipes and id repairs cannot be expressed incrementally. */
export function markSearchFullRebuild(): void {
  full = true;
  notify();
}

export function subscribeSearchWork(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasSearchWork(): boolean {
  return full || dirty.size > 0 || removed.size > 0;
}

export function takeSearchWork(): SearchWork | null {
  if (full) {
    full = false;
    dirty.clear();
    removed.clear();
    return { kind: "full" };
  }
  if (dirty.size === 0 && removed.size === 0) return null;

  const work: SearchWork = {
    kind: "incremental",
    ids: [...dirty],
    removed: [...removed],
  };
  dirty.clear();
  removed.clear();
  return work;
}

/** Test seam — the module state is process-wide. */
export function __resetSearchWork(): void {
  full = false;
  dirty.clear();
  removed.clear();
  notify();
}
