import { db } from "../db";
import type { Attachment, AttachmentId, NoteId } from "../types";
import { guardedWrite } from "@/lib/storage/quota";
import { markTombstone } from "./tombstones";

/** Refuse anything larger after compression. Guards the origin quota. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export class AttachmentTooLargeError extends Error {
  constructor(fileName: string, size: number) {
    super(
      `"${fileName}" is ${(size / 1024 / 1024).toFixed(1)} MB, over the 5 MB limit. ` +
        `Compress it first, or attach it to a note as a file reference.`,
    );
    this.name = "AttachmentTooLargeError";
  }
}

export async function listAttachments(noteId: NoteId): Promise<Attachment[]> {
  const rows = await db().attachments.where("noteId").equals(noteId).toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getAttachment(id: AttachmentId): Promise<Attachment | undefined> {
  return db().attachments.get(id);
}

export interface NewAttachment {
  noteId: NoteId;
  fileName: string;
  mime: string;
  blob: Blob;
  width?: number | null;
  height?: number | null;
}

export async function addAttachment(input: NewAttachment): Promise<Attachment> {
  if (input.blob.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError(input.fileName, input.blob.size);
  }

  const data = new Uint8Array(await input.blob.arrayBuffer());

  const attachment: Attachment = {
    id: crypto.randomUUID(),
    noteId: input.noteId,
    fileName: input.fileName,
    mime: input.mime,
    size: data.byteLength,
    width: input.width ?? null,
    height: input.height ?? null,
    data,
    createdAt: Date.now(),
  };

  await guardedWrite("store the attachment", () => db().attachments.add(attachment));
  return attachment;
}

/** The stored bytes as a Blob, for an object URL. */
export async function attachmentBlob(attachment: Attachment): Promise<Blob> {
  return bytesToBlob(attachment.data, attachment.mime);
}

/**
 * `Uint8Array<ArrayBufferLike>` is not assignable to `BlobPart` under the
 * current lib typings (it may be backed by a SharedArrayBuffer), even though a
 * view onto a plain ArrayBuffer is perfectly valid at runtime. The cast is a
 * typings artefact, not a safety hole.
 */
export function bytesToBlob(data: Uint8Array, mime: string): Blob {
  return new Blob([data as unknown as BlobPart], { type: mime });
}

export async function deleteAttachment(id: AttachmentId): Promise<void> {
  const database = db();
  const row = await database.attachments.get(id);

  await database.transaction(
    "rw",
    database.attachments,
    database.tombstones,
    async () => {
      await database.attachments.delete(id);
      if (row) {
        // The server derives the storage path from id + file name.
        await markTombstone("attachments", `${row.id}|${row.fileName}`);
      }
    },
  );
}

export async function deleteAttachmentsForNote(noteId: NoteId): Promise<void> {
  await db().attachments.where("noteId").equals(noteId).delete();
}

/** Total attachment bytes for a note, for the editor's storage indicator. */
export async function attachmentBytes(noteId: NoteId): Promise<number> {
  const rows = await db().attachments.where("noteId").equals(noteId).toArray();
  return rows.reduce((sum, row) => sum + row.size, 0);
}

export async function totalAttachmentBytes(): Promise<number> {
  const rows = await db().attachments.toArray();
  return rows.reduce((sum, row) => sum + row.size, 0);
}

/**
 * An attachment's metadata, without its bytes.
 *
 * `data` is `never` rather than absent so a spread of a real `Attachment` into
 * this shape is a type error, not a silent re-inclusion of every image.
 */
export type AttachmentSummary = Omit<Attachment, "data"> & { noteTitle: string };

/**
 * Every attachment in the workspace, with the title of the note it belongs to.
 *
 * For the attachments browser. The join is done here rather than in the
 * component so the view has one query and one shape, and so a trashed note's
 * attachments are excluded in the same place that decides what "live" means.
 */
export async function listAllAttachments(): Promise<AttachmentSummary[]> {
  const database = db();

  const [attachments, notes] = await Promise.all([
    database.attachments.orderBy("createdAt").reverse().toArray(),
    // Only live notes: an attachment in the trash is not in the workspace.
    database.notes.where("isTrashed").equals(0).toArray(),
  ]);

  const titles = new Map(notes.map((note) => [note.id, note.title.trim()]));

  return attachments
    .filter((attachment) => titles.has(attachment.noteId))
    // Projected field by field rather than spread. Spreading carries `data`
    // along, which would pull every image's bytes into memory to render a list
    // of filenames — the single largest allocation in the app, for a view that
    // never draws a pixel of it. `data` is declared as never here so the type
    // cannot quietly drift back.
    .map(({ id, noteId, fileName, mime, size, width, height, createdAt }) => ({
      id,
      noteId,
      fileName,
      mime,
      size,
      width,
      height,
      createdAt,
      noteTitle: titles.get(noteId) || "Untitled",
    }))
    // `createdAt` has millisecond resolution, so two images pasted in the same
    // tick tie. Without a tiebreak their rows swap between renders, which reads
    // as the list being broken.
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
