import type { NotesDatabase } from "./db";
import type { Attachment, NoteRow, NoteTag, NotebookRow, Tag } from "./types";
import { isUuid } from "@/lib/uuid";

export interface RemapResult {
  /** Primary keys rewritten to fresh UUIDs. */
  remapped: number;
  /** Dangling references cleared, or orphan rows dropped, because they can never become UUIDs. */
  sanitized: number;
}

/**
 * One-time migration for databases created before the backend phase.
 *
 * Sample data used readable ids (`seed-notebook-engineering`, `seed-note-0`),
 * which Postgres `uuid` columns reject — the sync engine could not push them.
 * This rewrites the primary key of every id-bearing table, and every foreign
 * reference to it, to a fresh UUID:
 *
 *   notebooks (parentId) · notes (notebookId) · tags · noteTags (noteId, tagId)
 *   attachments (noteId) · versions (noteId) · noteLinks (sourceId, targetId)
 *   tombstones (ref) · settings.lastNotebookId
 *
 * Anything that still cannot become a UUID afterwards — a reference to a row
 * that no longer exists, an orphaned join or attachment — is cleared or
 * dropped. None of it was ever on the server, so there is nothing to lose, and
 * leaving it in place would keep sync broken forever.
 *
 * Runs inside the Dexie v5 upgrade transaction and, via `repairLocalIds`,
 * outside it as well. Idempotent: a second pass finds nothing to do.
 */
export async function remapNonUuidIds(database: NotesDatabase): Promise<RemapResult> {
  const [notebooks, notes, tags, noteTags, attachments, versions, links, tombstones] =
    await Promise.all([
      database.notebooks.toArray(),
      database.notes.toArray(),
      database.tags.toArray(),
      database.noteTags.toArray(),
      database.attachments.toArray(),
      database.versions.toArray(),
      database.noteLinks.toArray(),
      database.tombstones.toArray(),
    ]);

  const notebookMap = newIdMap(notebooks);
  const noteMap = newIdMap(notes);
  const tagMap = newIdMap(tags);
  const attachmentMap = newIdMap(attachments);

  const remapped = notebookMap.size + noteMap.size + tagMap.size + attachmentMap.size;
  let sanitized = 0;

  const remap = (map: Map<string, string>) => {
    return (value: string) => map.get(value) ?? value;
  };
  const notebook = remap(notebookMap);
  const note = remap(noteMap);
  const tag = remap(tagMap);
  const attachment = remap(attachmentMap);

  // --- notebooks: remap the key; a parent that is still not a uuid points at
  // a notebook that no longer exists, so the row becomes a root. ---
  const putNotebooks: NotebookRow[] = [];
  const deleteNotebookIds: string[] = [];
  for (const row of notebooks) {
    let parentId = notebook(row.parentId);
    if (parentId !== "" && !isUuid(parentId)) {
      parentId = "";
      sanitized += 1;
    }
    const id = notebook(row.id);
    if (id !== row.id) deleteNotebookIds.push(row.id);
    if (id !== row.id || parentId !== row.parentId) {
      putNotebooks.push({ ...row, id, parentId });
    }
  }
  if (putNotebooks.length > 0) await database.notebooks.bulkPut(putNotebooks);
  if (deleteNotebookIds.length > 0) await database.notebooks.bulkDelete(deleteNotebookIds);

  // --- notes: a dangling notebook reference becomes unfiled. ---
  const putNotes: NoteRow[] = [];
  const deleteNoteIds: string[] = [];
  for (const row of notes) {
    let notebookId = notebook(row.notebookId);
    if (notebookId !== "" && !isUuid(notebookId)) {
      notebookId = "";
      sanitized += 1;
    }
    const id = note(row.id);
    if (id !== row.id) deleteNoteIds.push(row.id);
    if (id !== row.id || notebookId !== row.notebookId) {
      putNotes.push({ ...row, id, notebookId });
    }
  }
  if (putNotes.length > 0) await database.notes.bulkPut(putNotes);
  if (deleteNoteIds.length > 0) await database.notes.bulkDelete(deleteNoteIds);

  // --- tags ---
  const putTags: Tag[] = [];
  const deleteTagIds: string[] = [];
  for (const row of tags) {
    const id = tag(row.id);
    if (id === row.id) continue;
    putTags.push({ ...row, id });
    deleteTagIds.push(row.id);
  }
  if (putTags.length > 0) await database.tags.bulkPut(putTags);
  if (deleteTagIds.length > 0) await database.tags.bulkDelete(deleteTagIds);

  // --- note tags: refs are remapped, but a row whose note or tag is gone has
  // an id that can never become a uuid — and it was never on the server. ---
  const putNoteTags: NoteTag[] = [];
  const dropNoteTagIds: string[] = [];
  for (const row of noteTags) {
    const noteId = note(row.noteId);
    const tagId = tag(row.tagId);
    if (!isUuid(noteId) || !isUuid(tagId)) {
      dropNoteTagIds.push(row.id);
      sanitized += 1;
      continue;
    }
    if (noteId !== row.noteId || tagId !== row.tagId) {
      putNoteTags.push({ ...row, noteId, tagId });
    }
  }
  if (putNoteTags.length > 0) await database.noteTags.bulkPut(putNoteTags);
  if (dropNoteTagIds.length > 0) await database.noteTags.bulkDelete(dropNoteTagIds);

  // --- attachments: an attachment whose note is gone cannot be referenced or
  // synced; drop it rather than push an impossible id forever. ---
  const putAttachments: Attachment[] = [];
  const deleteAttachmentIds: string[] = [];
  for (const row of attachments) {
    const noteId = note(row.noteId);
    if (!isUuid(noteId)) {
      deleteAttachmentIds.push(row.id);
      sanitized += 1;
      continue;
    }
    const id = attachment(row.id);
    if (id !== row.id) deleteAttachmentIds.push(row.id);
    if (id !== row.id || noteId !== row.noteId) {
      putAttachments.push({ ...row, id, noteId });
    }
  }
  if (putAttachments.length > 0) await database.attachments.bulkPut(putAttachments);
  if (deleteAttachmentIds.length > 0) await database.attachments.bulkDelete(deleteAttachmentIds);

  // Version history and wiki links are local-only; their notes' ids still have
  // to stay in step for the UI, but a leftover dangling ref here is harmless.
  const putVersions = [];
  for (const row of versions) {
    const noteId = note(row.noteId);
    if (noteId !== row.noteId) putVersions.push({ ...row, noteId });
  }
  if (putVersions.length > 0) await database.versions.bulkPut(putVersions);

  const putLinks = [];
  for (const row of links) {
    const sourceId = note(row.sourceId);
    const targetId = note(row.targetId);
    if (sourceId !== row.sourceId || targetId !== row.targetId) {
      putLinks.push({ ...row, sourceId, targetId });
    }
  }
  if (putLinks.length > 0) await database.noteLinks.bulkPut(putLinks);

  // --- tombstones: remap resolvable refs, drop deletions whose target is
  // itself long-gone seed data (it was never on the server). ---
  if (tombstones.length > 0) {
    const nextRows: typeof tombstones = [];
    const staleKeys: string[] = [];

    for (const row of tombstones) {
      let ref = row.ref;
      if (row.table === "notebooks") {
        ref = notebook(ref);
      } else if (row.table === "notes") {
        ref = note(ref);
      } else if (row.table === "tags") {
        ref = tag(ref);
      } else if (row.table === "attachments") {
        const index = ref.indexOf("|");
        const id = index === -1 ? ref : ref.slice(0, index);
        const fileName = index === -1 ? "file" : ref.slice(index + 1);
        ref = `${attachment(id)}|${fileName}`;
      } else if (row.table === "note_tags") {
        const [noteId, tagId] = ref.split("|");
        ref = `${note(noteId)}|${tag(tagId)}`;
      }

      if (!tombstoneRefIsUuid(row.table, ref)) {
        staleKeys.push(row.key);
        sanitized += 1;
        continue;
      }

      const key = `${row.table}:${ref}`;
      if (key === row.key) continue; // untouched
      nextRows.push({ ...row, ref, key });
      staleKeys.push(row.key);
    }

    if (nextRows.length > 0) await database.tombstones.bulkPut(nextRows);
    if (staleKeys.length > 0) await database.tombstones.bulkDelete(staleKeys);
  }

  // --- the remembered notebook ---
  const lastNotebook = await database.settings.get("lastNotebookId");
  if (lastNotebook !== undefined && typeof lastNotebook.value === "string") {
    const mapped = notebook(lastNotebook.value);
    const clean = mapped !== "" && !isUuid(mapped) ? "" : mapped;
    if (clean !== lastNotebook.value) {
      await database.settings.put({ key: "lastNotebookId", value: clean });
      if (clean === "") sanitized += 1;
    }
  }

  // The persisted search index is keyed by note id; every id just changed, so
  // a restored index would point at rows that no longer exist.
  await database.searchIndex.clear();

  return { remapped, sanitized };
}

/**
 * Re-runnable repair for databases that are already on the current schema.
 *
 * The Dexie upgrade only runs once per version bump, so data that arrives
 * afterwards — an old ZIP restore, an import — would keep ids Postgres
 * rejects forever, across reloads. Sync calls this when it hits a uuid syntax
 * error, and the restore path calls it at the end of an import. One
 * transaction keeps every id and every reference in step.
 */
export async function repairLocalIds(database: NotesDatabase): Promise<RemapResult> {
  return database.transaction(
    "rw",
    [
      database.notebooks,
      database.notes,
      database.tags,
      database.noteTags,
      database.attachments,
      database.versions,
      database.noteLinks,
      database.tombstones,
      database.settings,
      database.searchIndex,
    ],
    () => remapNonUuidIds(database),
  );
}

function newIdMap<T extends { id: string }>(rows: T[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!isUuid(row.id)) map.set(row.id, crypto.randomUUID());
  }
  return map;
}

function tombstoneRefIsUuid(table: string, ref: string): boolean {
  if (table === "attachments") {
    const index = ref.indexOf("|");
    return isUuid(index === -1 ? ref : ref.slice(0, index));
  }
  if (table === "note_tags") {
    const [noteId, tagId] = ref.split("|");
    return isUuid(noteId) && isUuid(tagId);
  }
  return isUuid(ref);
}
