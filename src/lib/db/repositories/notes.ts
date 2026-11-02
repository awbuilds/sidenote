import { db, emptyDoc } from "../db";
import { fromNoteRow, toNoteRow } from "../convert";
import { rebuildLinksForNote, resolvePendingLinks } from "./links";
import { markTombstone } from "./tombstones";
import type { Note, NoteId, NotebookId } from "../types";
import { toStorageId } from "../types";
import { guardedWrite } from "@/lib/storage/quota";
import { getSettings } from "./settings";

function now(): number {
  return Date.now();
}

function newId(): string {
  return crypto.randomUUID();
}

export class NoteMissingError extends Error {
  constructor(id: NoteId) {
    super(`Note ${id} does not exist`);
    this.name = "NoteMissingError";
  }
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function getNote(id: NoteId): Promise<Note | undefined> {
  const row = await db().notes.get(id);
  return row ? fromNoteRow(row) : undefined;
}

export interface ListNotesOptions {
  notebookId?: NotebookId | null;
  includeTrashed?: boolean;
  includeUnfiled?: boolean;
  limit?: number;
}

/** Live notes, pinned first then most recently updated. */
export async function listNotes(options: ListNotesOptions = {}): Promise<Note[]> {
  const { notebookId, includeTrashed = false, limit } = options;
  const database = db();
  const trashed = includeTrashed ? 1 : 0;

  let rows;
  if (notebookId === undefined) {
    rows = await database.notes.where("isTrashed").equals(trashed).toArray();
  } else {
    rows = await database.notes
      .where("[notebookId+isTrashed]")
      .equals([toStorageId(notebookId), trashed])
      .toArray();
  }

  return sortNotes(rows.map(fromNoteRow), limit);
}

function sortNotes(notes: Note[], limit?: number): Note[] {
  const sorted = notes.sort(
    (a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt,
  );
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

/** Trashed notes, most recently trashed first. */
export async function listTrashedNotes(): Promise<Note[]> {
  const rows = await db().notes.where("isTrashed").equals(1).toArray();
  return rows
    .map(fromNoteRow)
    .sort((a, b) => (b.trashedAt ?? b.updatedAt) - (a.trashedAt ?? a.updatedAt));
}

export async function countNotes(): Promise<number> {
  return db().notes.where("isTrashed").equals(0).count();
}

export async function countTrashedNotes(): Promise<number> {
  return db().notes.where("isTrashed").equals(1).count();
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Create a note.
 *
 * `contentMarkdown` and `contentText` are derived from `contentJson`, but they
 * are passed in rather than computed here: the database layer must not depend
 * on the editor, and the caller already has the serialiser loaded. Omitting
 * them for a note that has a body would leave search and previews empty until
 * the first autosave, so any caller seeding content should pass them.
 */
export async function createNote(input: {
  notebookId?: NotebookId | null;
  title?: string;
  contentJson?: Note["contentJson"];
  contentMarkdown?: string;
  contentText?: string;
}): Promise<Note> {
  const timestamp = now();
  const note: Note = {
    id: newId(),
    notebookId: input.notebookId ?? null,
    title: input.title ?? "",
    contentJson: input.contentJson ?? emptyDoc(),
    contentMarkdown: input.contentMarkdown ?? "",
    contentText: input.contentText ?? "",
    isPinned: false,
    isTrashed: false,
    trashedAt: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await guardedWrite("create the note", async () => {
    await db().transaction("rw", db().notes, db().settings, async () => {
      await db().notes.add(toNoteRow(note));
      await bumpDataVersion();
    });
  });

  return note;
}

export interface ContentPatch {
  title?: string;
  contentJson: Note["contentJson"];
  contentMarkdown: string;
  contentText: string;
}

/**
 * Persist editor content.
 *
 * Snapshots the *previous* state into `versions` before overwriting, bumps
 * `version`, and prunes history to the configured caps. Autosave calls this on
 * a debounce, so it must be cheap and must never lose a write.
 */
export async function saveNoteContent(id: NoteId, patch: ContentPatch): Promise<Note> {
  const database = db();
  const timestamp = now();

  return guardedWrite("save the note", () =>
    database.transaction("rw", database.notes, database.versions, database.settings, async () => {
      const row = await database.notes.get(id);
      if (!row) throw new NoteMissingError(id);

      const current = fromNoteRow(row);

      // Snapshot the state we are about to overwrite.
      await database.versions.add({
        id: newId(),
        noteId: id,
        title: current.title,
        contentJson: current.contentJson,
        contentMarkdown: current.contentMarkdown,
        contentText: current.contentText,
        version: current.version,
        createdAt: timestamp,
      });

      const updated: Note = {
        ...current,
        title: patch.title ?? current.title,
        contentJson: patch.contentJson,
        contentMarkdown: patch.contentMarkdown,
        contentText: patch.contentText,
        version: current.version + 1,
        updatedAt: timestamp,
      };

      await database.notes.put(toNoteRow(updated));
      await pruneVersions(id);
      await bumpDataVersion();

      return updated;
    }),
  ).then(async (note) => {
    // The link index is derived from the body, so it is rebuilt after the save
    // rather than inside it — `rebuildLinksForNote` opens its own transaction
    // and must not be nested in this one. A failure here must not fail the
    // save: the content is already durable, and the index self-heals on the
    // next save.
    try {
      await rebuildLinksForNote(id, note.contentText);
      await resolvePendingLinks();
    } catch {
      // A stale link index is a cosmetic problem, not a data-loss one.
    }
    return note;
  });
}

export async function renameNote(id: NoteId, title: string): Promise<void> {
  await db()
    .transaction("rw", db().notes, db().settings, async () => {
      const result = await db().notes.update(id, { title, updatedAt: now() });
      if (result === 0) throw new NoteMissingError(id);
      await bumpDataVersion();
    })
    .then(async () => {
      // Links resolve by id, so backlinks survive a rename untouched. Only the
      // cached display title needs refreshing — the source body still says the
      // old name, and re-saving that source re-resolves it.
      const rows = await db().noteLinks.where("targetId").equals(id).toArray();
      if (rows.length > 0) {
        await db().noteLinks.bulkPut(rows.map((row) => ({ ...row, targetTitle: title })));
      }
      await resolvePendingLinks();
    });
}

export async function togglePin(id: NoteId): Promise<boolean> {
  const database = db();
  return database.transaction("rw", database.notes, async () => {
    const row = await database.notes.get(id);
    if (!row) throw new NoteMissingError(id);
    const next = row.isPinned === 1 ? 0 : 1;
    await database.notes.update(id, { isPinned: next, updatedAt: now() });
    return next === 1;
  });
}

export async function moveNotes(ids: NoteId[], notebookId: NotebookId | null): Promise<void> {
  if (ids.length === 0) return;
  await db()
    .notes.where("id")
    .anyOf(ids)
    .modify({ notebookId: toStorageId(notebookId), updatedAt: now() });
}

/* ------------------------------------------------------------------ */
/* Trash                                                               */
/* ------------------------------------------------------------------ */

export async function trashNotes(ids: NoteId[]): Promise<void> {
  if (ids.length === 0) return;
  const timestamp = now();
  await db().notes
    .where("id")
    .anyOf(ids)
    .modify({ isTrashed: 1, trashedAt: timestamp, updatedAt: timestamp });
}

export async function restoreNotes(ids: NoteId[]): Promise<void> {
  if (ids.length === 0) return;
  await db().notes
    .where("id")
    .anyOf(ids)
    .modify({ isTrashed: 0, trashedAt: null, updatedAt: now() });
}

/** Permanent delete. Also removes tags, attachments and version history. */
export async function purgeNotes(ids: NoteId[]): Promise<void> {
  if (ids.length === 0) return;
  const database = db();

  await guardedWrite("delete the note", () =>
    database.transaction(
      "rw",
      // Dexie's transaction() takes at most six table arguments; pass an array.
      [
        database.notes,
        database.noteTags,
        database.attachments,
        database.versions,
        database.noteLinks,
        database.settings,
        database.tombstones,
      ],
      async () => {
        await database.noteTags.where("noteId").anyOf(ids).delete();
        // Attachments sync as bytes: the tombstone lets the server delete both
        // the storage object and the metadata row.
        const doomedAttachments = await database.attachments
          .where("noteId")
          .anyOf(ids)
          .toArray();
        for (const attachment of doomedAttachments) {
          await markTombstone("attachments", `${attachment.id}|${attachment.fileName}`);
        }
        await database.attachments.where("noteId").anyOf(ids).delete();
        await database.versions.where("noteId").anyOf(ids).delete();
        // Links in both directions: a purged note must not leave outgoing
        // links behind, and must stop being a backlink target.
        for (const id of ids) {
          await database.noteLinks.where("sourceId").equals(id).delete();
          await database.noteLinks.where("targetId").equals(id).delete();
        }
        await database.notes.bulkDelete(ids);
        for (const id of ids) await markTombstone("notes", id);
        await bumpDataVersion();
      },
    ),
  );
}

export async function emptyTrash(): Promise<void> {
  const ids = await db().notes.where("isTrashed").equals(1).primaryKeys();
  await purgeNotes([...ids]);
}

/* ------------------------------------------------------------------ */
/* Version history                                                     */
/* ------------------------------------------------------------------ */

/**
 * Trim a note's history to the configured caps. Runs inside the save
 * transaction so history cannot grow without bound if pruning is skipped.
 */
async function pruneVersions(noteId: NoteId): Promise<void> {
  const database = db();
  const { versionLimit, versionMaxAgeDays } = await getSettings();

  const all = await database.versions.where("noteId").equals(noteId).toArray();
  if (all.length === 0) return;

  const cutoff = Date.now() - versionMaxAgeDays * 24 * 60 * 60 * 1000;
  const survivors = all
    .filter((version) => version.createdAt >= cutoff)
    .sort((a, b) => b.version - a.version)
    .slice(0, versionLimit);

  const doomed = all
    .filter((version) => !survivors.includes(version))
    .map((version) => version.id);

  if (doomed.length > 0) await database.versions.bulkDelete(doomed);
}

export async function listVersions(noteId: NoteId) {
  const rows = await db().versions.where("noteId").equals(noteId).toArray();
  return rows.sort((a, b) => b.version - a.version);
}

/** Replace a note's content with a historical snapshot. */
export async function restoreVersion(noteId: NoteId, version: number): Promise<Note> {
  const snapshot = await db().versions.where("[noteId+version]").equals([noteId, version]).first();
  if (!snapshot) throw new Error(`Version ${version} of note ${noteId} not found`);

  return saveNoteContent(noteId, {
    title: snapshot.title,
    contentJson: snapshot.contentJson,
    contentMarkdown: snapshot.contentMarkdown,
    contentText: snapshot.contentText,
  });
}

/* ------------------------------------------------------------------ */
/* Internal                                                            */
/* ------------------------------------------------------------------ */

async function bumpDataVersion(): Promise<void> {
  const { dataVersion } = await getSettings();
  await db().settings.put({ key: "dataVersion", value: dataVersion + 1 });
}
