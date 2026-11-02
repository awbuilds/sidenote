import JSZip from "jszip";
import type { JSONContent } from "@tiptap/core";
import { db } from "@/lib/db/db";
import { toNotebookRow, fromNoteRow } from "@/lib/db/convert";
import { docToText } from "@/lib/tiptap/doc";
import { toMarkdown } from "@/lib/tiptap/markdown";
import { slugify } from "./export-note";
import type { Note, NoteRow, Notebook } from "@/lib/db/types";

/**
 * Whole-library backup.
 *
 * Two layers, deliberately:
 *
 *   data.json  lossless — exact ids, `contentJson`, version history, trash
 *              state, tag links, attachment metadata. This is what a restore
 *              uses, so a round trip is genuinely lossless.
 *
 *   notes/*.md human-readable Markdown with front matter and relative
 *              attachment links. This is what survives the app existing, and
 *              is greppable in any editor.
 *
 * A backup that only had the Markdown would silently drop version history and
 * attachments. A backup that only had `data.json` would be useless to a human.
 */

export const EXPORT_FORMAT_VERSION = 1;

export interface ExportManifest {
  app: "sidenote";
  formatVersion: number;
  exportedAt: string;
  counts: {
    notebooks: number;
    notes: number;
    attachments: number;
    tags: number;
  };
}

export interface ExportData {
  manifest: ExportManifest;
  notebooks: Notebook[];
  /** Rows with `contentJson` intact, including trashed notes. */
  notes: NoteRow[];
  tags: { id: string; name: string; color: string; createdAt: number }[];
  noteTags: { id: string; noteId: string; tagId: string }[];
  /**
   * Attachment metadata *without* the bytes, plus the archive path the bytes
   * live at. A restore into empty storage has no existing rows to look up, so
   * this is the only way it can learn what a file was called.
   */
  attachments: {
    id: string;
    noteId: string;
    fileName: string;
    mime: string;
    size: number;
    width: number | null;
    height: number | null;
    createdAt: number;
    path: string;
  }[];
  versions: {
    id: string;
    noteId: string;
    title: string;
    contentJson: JSONContent;
    contentMarkdown: string;
    contentText: string;
    version: number;
    createdAt: number;
  }[];
}

const FRONT_MATTER_KEYS = new Set([
  "title",
  "id",
  "notebook",
  "created",
  "updated",
  "version",
  "trashed",
  "tags",
  "attachments",
]);

/** Escape a value for a single-line front-matter field. */
function yamlScalar(value: string): string {
  if (/[:#\n"]/.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
  return value;
}

export function noteFileName(note: Note): string {
  return `${slugify(note.title) || "untitled"}-${note.id.slice(0, 8)}.md`;
}

export function buildMarkdown(note: Note, notebooks: Map<string, Notebook>): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries({
    title: note.title,
    id: note.id,
    notebook: note.notebookId === null ? "" : (notebooks.get(note.notebookId)?.name ?? ""),
    created: new Date(note.createdAt).toISOString(),
    updated: new Date(note.updatedAt).toISOString(),
    version: String(note.version),
    trashed: note.isTrashed ? "true" : "false",
  })) {
    if (FRONT_MATTER_KEYS.has(key)) lines.push(`${key}: ${yamlScalar(value)}`);
  }
  lines.push("---", "");

  const body = note.contentMarkdown || toMarkdown(note.contentJson);
  lines.push(body.trimEnd(), "");

  return lines.join("\n");
}

function extensionFor(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("avif")) return "avif";
  return "bin";
}

/**
 * Build the ZIP. Includes trashed notes — a backup that silently drops the
 * trash is not a backup.
 */
export async function exportAll(): Promise<{ blob: Blob; manifest: ExportManifest }> {
  const database = db();

  const [notebookRows, noteRows, tagRows, noteTagRows, versionRows] = await Promise.all([
    database.notebooks.toArray(),
    database.notes.toArray(),
    database.tags.toArray(),
    database.noteTags.toArray(),
    database.versions.toArray(),
  ]);

  const notebooks = notebookRows.map(toNotebookRow);
  const notes = noteRows;
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));

  const attachments = await database.attachments.toArray();
  const attachmentsByNote = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const bucket = attachmentsByNote.get(attachment.noteId);
    if (bucket) bucket.push(attachment);
    else attachmentsByNote.set(attachment.noteId, [attachment]);
  }

  const manifest: ExportManifest = {
    app: "sidenote",
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      notebooks: notebooks.length,
      notes: notes.length,
      attachments: attachments.length,
      tags: tagRows.length,
    },
  };

  const attachmentManifest: ExportData["attachments"] = [];

  const data: ExportData = {
    manifest,
    notebooks: notebookRows.map(fromNotebookRowPlain),
    notes,
    tags: tagRows,
    noteTags: noteTagRows,
    attachments: attachmentManifest,
    versions: versionRows,
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // Readable Markdown + relative attachment paths. This also fills in
  // `data.attachments`, so data.json is serialised afterwards — writing it
  // first would capture an empty attachment list.
  const notesFolder = zip.folder("notes");
  for (const note of notes) {
    const domain: Note = fromNoteRow(note);
    notesFolder?.file(noteFileName(domain), buildMarkdown(domain, byId));

    const bucket = attachmentsByNote.get(note.id) ?? [];
    for (const attachment of bucket) {
      const stem = slugify(attachment.fileName).replace(/\.[^.]*$/, "");
      const path = `attachments/${note.id}/${stem}.${extensionFor(attachment.mime)}`;

      zip.file(path, attachment.data);
      attachmentManifest.push({
        id: attachment.id,
        noteId: attachment.noteId,
        fileName: attachment.fileName,
        mime: attachment.mime,
        size: attachment.size,
        width: attachment.width,
        height: attachment.height,
        createdAt: attachment.createdAt,
        path,
      });
    }
  }

  // Lossless payload, now that the attachment manifest is complete.
  zip.file("data.json", JSON.stringify(data));

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { blob, manifest };
}

function fromNotebookRowPlain(row: {
  id: string;
  parentId: string;
  name: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}): Notebook {
  return { ...row, parentId: row.parentId === "" ? null : row.parentId };
}

export function defaultArchiveName(): string {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `sidenote-backup-${stamp}.zip`;
}

/** Read an archive's manifest without importing anything. */
export async function parseExportedManifest(
  file: File | Blob,
): Promise<ExportManifest | null> {
  const { readArchive } = await import("./zip-import");
  const zip = await readArchive(file);
  const entry = zip.file("manifest.json");
  if (entry === null) return null;
  try {
    return JSON.parse(await entry.async("string")) as ExportManifest;
  } catch {
    return null;
  }
}

export { docToText };
