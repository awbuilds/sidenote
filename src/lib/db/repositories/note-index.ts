import Dexie from "dexie";
import { db } from "../db";
import { fromNoteRow } from "../convert";
import type { Note, NoteId } from "../types";

/**
 * Index-only reads over `notes`.
 *
 * Dexie cannot select a subset of fields, and a `Note` carries the whole
 * TipTap document. These helpers use compound indexes so a caller that only
 * needs titles, ids or the newest N rows never materialises a body.
 *
 * They live in their own module because `repositories/notes.ts` and
 * `repositories/links.ts` both need them and importing one from the other
 * would create a cycle.
 */

/**
 * Live note titles and ids, without their bodies.
 *
 * `keys()` on a compound index returns the index keys rather than the records,
 * so `[isTrashed+title+id]` reads every title in the library without loading a
 * single `contentJson`.
 */
export async function listNoteTitleIndex(): Promise<{ id: NoteId; title: string }[]> {
  const keys = (await db()
    .notes.where("[isTrashed+title+id]")
    .between([0, Dexie.minKey], [0, Dexie.maxKey])
    .keys()) as unknown as [number, string, NoteId][];

  return keys.map(([, title, id]) => ({ id, title }));
}

/** The most recently updated live notes, read in index order with a limit. */
export async function listRecentNotes(limit: number): Promise<Note[]> {
  if (limit <= 0) return [];
  const rows = await db()
    .notes.where("[isTrashed+updatedAt]")
    .between([0, Dexie.minKey], [0, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
  return rows.map(fromNoteRow);
}

/** Primary keys only — enough for counts and membership tests. */
export async function liveNoteIds(): Promise<NoteId[]> {
  return db().notes.where("isTrashed").equals(0).primaryKeys();
}
