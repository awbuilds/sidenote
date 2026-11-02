import { db } from "../db";
import type { TombstoneRow } from "../types";

/**
 * Deletion markers.
 *
 * LWW reconciliation can compare rows that exist on both sides, but a row that
 * vanished locally is indistinguishable from one that was never pushed. A
 * tombstone records the deletion until the remote delete succeeds; it is the
 * only state the sync engine keeps.
 *
 * `ref` is the row id, except for the `note_tags` join table where it is
 * `"{note_id}|{tag_id}"`.
 */
export type TombstoneTable = TombstoneRow["table"];

export function tombstoneKey(table: TombstoneTable, ref: string): string {
  return `${table}:${ref}`;
}

export function parseNoteTagRef(ref: string): { noteId: string; tagId: string } {
  const [noteId, tagId] = ref.split("|");
  return { noteId, tagId };
}

/** File names may contain `|`; only the first separator is structural. */
export function parseAttachmentRef(ref: string): { id: string; fileName: string } {
  const index = ref.indexOf("|");
  if (index === -1) return { id: ref, fileName: "file" };
  return { id: ref.slice(0, index), fileName: ref.slice(index + 1) };
}

/** Mark a local deletion. Call inside the deleting transaction. */
export async function markTombstone(table: TombstoneTable, ref: string): Promise<void> {
  await db().tombstones.put({
    key: tombstoneKey(table, ref),
    table,
    ref,
    deletedAt: Date.now(),
  });
}

/** Mark many deletions at once, for table-clearing paths. */
export async function markTombstones(rows: TombstoneRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db().tombstones.bulkPut(rows);
}

export async function listTombstones(): Promise<TombstoneRow[]> {
  return db().tombstones.toArray();
}

export async function clearTombstones(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await db().tombstones.bulkDelete(keys);
}
