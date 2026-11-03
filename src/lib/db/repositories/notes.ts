import { db, emptyDoc } from "../db";
import { fromNoteRow, toNoteRow } from "../convert";
import { rebuildLinksForNote, resolvePendingLinks } from "./links";
import { markTombstone } from "./tombstones";
import type { Note, NoteId, NotebookId, NoteVersion } from "../types";
import { toStorageId } from "../types";
import { guardedWrite } from "@/lib/storage/quota";
import { getSettings } from "./settings";
import { MANUAL_VERSION_LIMIT, nextSnapshotVersion, shouldSnapshot } from "../version-policy";
import { markSearchDirty, markSearchRemoved } from "@/lib/search/dirty";

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

/** Every live note, bodies included — the search index rebuild corpus. */
export async function listSearchNotes(): Promise<Note[]> {
  const rows = await db().notes.where("isTrashed").equals(0).toArray();
  return rows.map(fromNoteRow);
}

/** A batch read for incremental reindexing. Missing rows are dropped. */
export async function getNotesByIds(ids: NoteId[]): Promise<Note[]> {
  if (ids.length === 0) return [];
  const rows = await db().notes.bulkGet(ids);
  return rows
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map(fromNoteRow);
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

  markSearchDirty([note.id]);
  return note;
}

export interface ContentPatch {
  title?: string;
  contentJson: Note["contentJson"];
  contentMarkdown: string;
  contentText: string;
}

export interface SaveNoteOptions {
  /**
   * Snapshot the current state even when the cadence policy would skip it.
   * Restoring a version uses this so the pre-restore state is never lost.
   */
  forceSnapshot?: boolean;
}

/**
 * Persist editor content.
 *
 * Snapshots the *previous* state into `versions` when the cadence policy says
 * the edit is worth a checkpoint, bumps `version`, and prunes history to the
 * configured caps. Autosave calls this on a debounce, so it must be cheap and
 * must never lose a write.
 */
export async function saveNoteContent(
  id: NoteId,
  patch: ContentPatch,
  options: SaveNoteOptions = {},
): Promise<Note> {
  const database = db();
  const timestamp = now();

  return guardedWrite("save the note", () =>
    database.transaction("rw", database.notes, database.versions, database.settings, async () => {
      const row = await database.notes.get(id);
      if (!row) throw new NoteMissingError(id);

      const current = fromNoteRow(row);
      const history = await database.versions.where("noteId").equals(id).toArray();
      const highestHistory = history.reduce(
        (highest, version) => Math.max(highest, version.version),
        0,
      );
      const lastSnapshotAt = history.reduce(
        (latest, version) => Math.max(latest, version.createdAt),
        0,
      );

      // The snapshot takes a number the note has never used, so a sync pull
      // that moved `version` backwards cannot collide with the unique
      // `[noteId+version]` index and wedge every later save.
      const snapshotVersion = nextSnapshotVersion(current.version, highestHistory);

      const snapshot =
        options.forceSnapshot === true ||
        shouldSnapshot({
          hasHistory: history.length > 0,
          previousTitle: current.title,
          nextTitle: patch.title ?? current.title,
          lastSnapshotAt: lastSnapshotAt === 0 ? null : lastSnapshotAt,
          now: timestamp,
        });

      if (snapshot) {
        // Snapshot the state we are about to overwrite.
        await database.versions.add({
          id: newId(),
          noteId: id,
          title: current.title,
          contentJson: current.contentJson,
          contentMarkdown: current.contentMarkdown,
          contentText: current.contentText,
          version: snapshotVersion,
          kind: "auto",
          createdAt: timestamp,
        });
      }

      const updated: Note = {
        ...current,
        title: patch.title ?? current.title,
        contentJson: patch.contentJson,
        contentMarkdown: patch.contentMarkdown,
        contentText: patch.contentText,
        version: snapshotVersion + 1,
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
    markSearchDirty([id]);
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
      markSearchDirty([id]);
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
  markSearchRemoved(ids);
}

/**
 * Restore notes from the trash.
 *
 * A note can be trashed as a side effect of deleting its notebook. That leaves
 * `notebookId` pointing at a row that no longer exists, and because "Unfiled"
 * matches the empty-string sentinel, the restored note appeared in no notebook
 * at all. Clearing the dangling reference puts it where the user can find it.
 */
export async function restoreNotes(ids: NoteId[]): Promise<void> {
  if (ids.length === 0) return;
  const database = db();

  await database.transaction("rw", database.notes, database.notebooks, async () => {
    const rows = await database.notes.where("id").anyOf(ids).toArray();
    const notebookIds = [
      ...new Set(rows.map((row) => row.notebookId).filter((id) => id !== "")),
    ];
    const existing = new Set(
      notebookIds.length === 0
        ? []
        : await database.notebooks.where("id").anyOf(notebookIds).primaryKeys(),
    );

    const timestamp = now();
    for (const row of rows) {
      const orphaned = row.notebookId !== "" && !existing.has(row.notebookId);
      await database.notes.update(row.id, {
        isTrashed: 0,
        trashedAt: null,
        notebookId: orphaned ? "" : row.notebookId,
        updatedAt: timestamp,
      });
    }
  });

  markSearchDirty(ids);
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

  markSearchRemoved(ids);
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
 *
 * Automatic snapshots obey the count and age caps; a named version is user
 * intent, so age never removes it and only a generous count ceiling applies.
 */
async function pruneVersions(noteId: NoteId): Promise<void> {
  const database = db();
  const { versionLimit, versionMaxAgeDays } = await getSettings();

  const all = await database.versions.where("noteId").equals(noteId).toArray();
  if (all.length === 0) return;

  const cutoff = Date.now() - versionMaxAgeDays * 24 * 60 * 60 * 1000;
  const newestFirst = (a: { version: number }, b: { version: number }) => b.version - a.version;

  const automatic = all.filter((version) => version.kind !== "manual");
  const named = all.filter((version) => version.kind === "manual");

  const keptAutomatic = automatic
    .filter((version) => version.createdAt >= cutoff)
    .sort(newestFirst)
    .slice(0, versionLimit);
  const keptNamed = named.sort(newestFirst).slice(0, MANUAL_VERSION_LIMIT);

  const keep = new Set([...keptAutomatic, ...keptNamed].map((version) => version.id));
  const doomed = all.filter((version) => !keep.has(version.id)).map((version) => version.id);

  if (doomed.length > 0) await database.versions.bulkDelete(doomed);
}

export async function listVersions(noteId: NoteId) {
  const rows = await db().versions.where("noteId").equals(noteId).toArray();
  return rows.sort((a, b) => b.version - a.version);
}

/**
 * Capture the note's current state as a named checkpoint.
 *
 * It takes the next unused version number without advancing the note, so the
 * next autosave continues from a number that cannot collide.
 */
export async function createVersion(noteId: NoteId, label: string): Promise<NoteVersion> {
  const database = db();

  return database.transaction(
    "rw",
    database.notes,
    database.versions,
    database.settings,
    async () => {
      const row = await database.notes.get(noteId);
      if (!row) throw new NoteMissingError(noteId);

      const history = await database.versions.where("noteId").equals(noteId).toArray();
      const highest = history.reduce(
        (top, version) => Math.max(top, version.version),
        0,
      );

      const version: NoteVersion = {
        id: newId(),
        noteId,
        title: row.title,
        contentJson: row.contentJson,
        contentMarkdown: row.contentMarkdown,
        contentText: row.contentText,
        version: nextSnapshotVersion(row.version, highest),
        kind: "manual",
        label: label.trim() === "" ? undefined : label.trim(),
        createdAt: now(),
      };

      await database.versions.add(version);
      await pruneVersions(noteId);
      return version;
    },
  );
}

/** Replace a note's content with a historical snapshot. */
export async function restoreVersion(noteId: NoteId, version: number): Promise<Note> {
  const snapshot = await db().versions.where("[noteId+version]").equals([noteId, version]).first();
  if (!snapshot) throw new Error(`Version ${version} of note ${noteId} not found`);

  return saveNoteContent(
    noteId,
    {
      title: snapshot.title,
      contentJson: snapshot.contentJson,
      contentMarkdown: snapshot.contentMarkdown,
      contentText: snapshot.contentText,
    },
    // The state being replaced is exactly what a restore is likely to need to
    // undo, so it is always kept even if the cadence would skip it.
    { forceSnapshot: true },
  );
}

/* ------------------------------------------------------------------ */
/* Internal                                                            */
/* ------------------------------------------------------------------ */

async function bumpDataVersion(): Promise<void> {
  const { dataVersion } = await getSettings();
  await db().settings.put({ key: "dataVersion", value: dataVersion + 1 });
}
