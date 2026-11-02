import { db } from "../db";
import { fromNoteLinkRow, fromNoteRow, toNoteLinkRow } from "../convert";
import { linkTitles } from "@/lib/links/wiki";
import type { Note, NoteId, NoteLink, NoteLinkRow } from "../types";

/**
 * Outgoing note links, derived from the note body.
 *
 * `rebuildLinksForNote` is the only writer: it replaces every link for a note
 * in one transaction, so the table can never hold a link the note no longer
 * contains. The text is the source of truth, not these rows — if they ever
 * disagree, the text is right and a rebuild fixes it.
 */

/** Trashed notes are excluded: a link to a deleted note should not surface. */
const LIVE = { isTrashed: 0 } as const;

/** Title -> id, lowercased for case-insensitive matching. */
async function titleIndex(): Promise<Map<string, NoteId>> {
  const rows = await db().notes.where("isTrashed").equals(LIVE.isTrashed).toArray();
  const index = new Map<string, NoteId>();
  for (const row of rows) {
    const title = row.title.trim().toLowerCase();
    // First wins, so a duplicate title resolves deterministically to the
    // earliest-created note rather than whichever IndexedDB returns first.
    if (title !== "" && !index.has(title)) index.set(title, row.id);
  }
  return index;
}

/**
 * Replace the outgoing links for a note.
 *
 * A title that matches no note is still stored, with a null target. That is
 * deliberate: `[[Roof]]` written before the note exists should start working
 * the moment it does, without the author having to go back and re-save.
 */
export async function rebuildLinksForNote(noteId: NoteId, text: string): Promise<void> {
  const titles = linkTitles(text);
  if (titles.length === 0) {
    await db().noteLinks.where("sourceId").equals(noteId).delete();
    return;
  }

  const index = await titleIndex();
  const links: NoteLinkRow[] = [];

  for (const title of titles) {
    const targetId = index.get(title.toLowerCase()) ?? "";
    // A note that mentions its own title is not linking to itself — that would
    // make it its own backlink, and a note titled "Roof" saying "see [[Roof]]"
    // is an ordinary thing to write. The link stays in the text; if the note is
    // later renamed, the next save resolves it to whatever it now names.
    if (targetId === noteId) continue;
    links.push({ id: crypto.randomUUID(), sourceId: noteId, targetId, targetTitle: title, createdAt: Date.now() });
  }

  await db().transaction("rw", db().noteLinks, async () => {
    await db().noteLinks.where("sourceId").equals(noteId).delete();
    if (links.length > 0) await db().noteLinks.bulkAdd(links.map(toNoteLinkRow));
  });
}

/** Every outgoing link for a note, resolved or not. */
export async function outgoingLinks(noteId: NoteId): Promise<NoteLink[]> {
  const rows = await db().noteLinks.where("sourceId").equals(noteId).toArray();
  return rows.map(fromNoteLinkRow);
}

/**
 * Notes that link to this one.
 *
 * Resolved through `targetId` rather than the title, so renaming a note moves
 * its backlinks with it as soon as the source is re-saved. Ordered by recency:
 * the note you just linked from is the one you want to see.
 */
export async function backlinksFor(noteId: NoteId): Promise<Note[]> {
  const links = await db().noteLinks.where("targetId").equals(noteId).toArray();
  if (links.length === 0) return [];

  const sourceIds = [...new Set(links.map((link) => link.sourceId))];
  const rows = await db().notes.bulkGet(sourceIds);
  const notes = rows
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .filter((row) => row.isTrashed === LIVE.isTrashed)
    .map(fromNoteRow);

  const recency = new Map(links.map((link) => [link.sourceId, link.createdAt]));
  return notes.sort(
    (a, b) => (recency.get(b.id) ?? 0) - (recency.get(a.id) ?? 0),
  );
}

/**
 * Link counts for a batch of notes, for the list.
 *
 * One query per direction for the whole batch rather than one per note — the
 * list renders every row at once, and 200 notes would otherwise be 400 queries
 * on every sort change. Returns `{ outgoing, incoming }` per note id; ids with
 * no links are absent rather than zeroed, so callers can skip rendering.
 */
export async function linkCounts(
  noteIds: NoteId[],
): Promise<Map<NoteId, { outgoing: number; incoming: number }>> {
  const counts = new Map<NoteId, { outgoing: number; incoming: number }>();
  if (noteIds.length === 0) return counts;

  const bump = (id: NoteId, key: "outgoing" | "incoming") => {
    const entry = counts.get(id) ?? { outgoing: 0, incoming: 0 };
    entry[key] += 1;
    counts.set(id, entry);
  };

  const links = await db().noteLinks.toArray();
  const scope = new Set(noteIds);
  for (const link of links) {
    if (scope.has(link.sourceId)) bump(link.sourceId, "outgoing");
    // An unresolved link has targetId "", which is never in scope.
    if (link.targetId !== "" && scope.has(link.targetId)) bump(link.targetId, "incoming");
  }

  return counts;
}

/**
 * Re-resolve every unresolved link.
 *
 * Called after a note is created or renamed, so `[[Roof]]` starts working
 * without touching the notes that wrote it.
 */
export async function resolvePendingLinks(): Promise<number> {
  const pending = await db().noteLinks.filter((row) => row.targetId === "").toArray();
  if (pending.length === 0) return 0;

  const index = await titleIndex();
  const updates: NoteLinkRow[] = [];

  for (const row of pending) {
    const targetId = index.get(row.targetTitle.toLowerCase());
    // Skip the note's own title: a note linking to itself is not a backlink.
    if (targetId !== undefined && targetId !== row.sourceId) {
      updates.push({ ...row, targetId });
    }
  }

  if (updates.length > 0) {
    await db().noteLinks.bulkPut(updates);
  }
  return updates.length;
}

/** Drop links whose source note is gone. Called when a note is hard-deleted. */
export async function deleteLinksForNote(noteId: NoteId): Promise<void> {
  await db().noteLinks.where("sourceId").equals(noteId).delete();
  await db().noteLinks.where("targetId").equals(noteId).delete();
}
