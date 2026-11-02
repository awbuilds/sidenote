import type { Note, NoteLink, NoteLinkRow, NoteRow, Notebook, NotebookRow } from "./types";
import { fromStorageId, toStorageId } from "./types";

/* Conversions between the domain model (`string | null`, booleans) and the
 * row shape that IndexedDB can actually index (`""`, `0 | 1`).
 *
 * These exist because IndexedDB rejects `null` and `boolean` as keys. Anything
 * written straight to a table must go through here. */

/* ----------------------------- notebooks ----------------------------- */

export function toNotebookRow(notebook: Notebook): NotebookRow {
  return { ...notebook, parentId: toStorageId(notebook.parentId) };
}

export function fromNotebookRow(row: NotebookRow): Notebook {
  return { ...row, parentId: fromStorageId(row.parentId) };
}

/* ------------------------------- notes ------------------------------- */

export function toNoteRow(note: Note): NoteRow {
  const { isPinned, isTrashed, notebookId, ...rest } = note;
  return {
    ...rest,
    notebookId: toStorageId(notebookId),
    isPinned: isPinned ? 1 : 0,
    isTrashed: isTrashed ? 1 : 0,
  };
}

export function fromNoteRow(row: NoteRow): Note {
  const { isPinned, isTrashed, notebookId, ...rest } = row;
  return {
    ...rest,
    notebookId: fromStorageId(notebookId),
    isPinned: isPinned === 1,
    isTrashed: isTrashed === 1,
  };
}

/* ----------------------------- note links ----------------------------- */

export function toNoteLinkRow(link: NoteLink): NoteLinkRow {
  return { ...link, targetId: toStorageId(link.targetId) };
}

export function fromNoteLinkRow(row: NoteLinkRow): NoteLink {
  return { ...row, targetId: fromStorageId(row.targetId) };
}
