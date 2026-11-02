import JSZip from "jszip";
import { db } from "@/lib/db/db";
import { toNoteRow, toNotebookRow } from "@/lib/db/convert";
import { repairLocalIds } from "@/lib/db/migrate-ids";
import { touchDataVersion } from "@/lib/db/repositories/settings";
import { EXPORT_FORMAT_VERSION, type ExportData } from "./zip-export";
import type { Note, Notebook } from "@/lib/db/types";

/**
 * Restore from a backup.
 *
 * Prefers `data.json` for a lossless restore. Falls back to parsing the
 * Markdown files if only those are present — that is the "someone handed me
 * a folder of notes" path, and it degrades honestly (no version history, no
 * attachments) rather than pretending.
 */

export interface ImportResult {
  mode: "full" | "markdown";
  notebooks: number;
  notes: number;
  attachments: number;
  tags: number;
  warnings: string[];
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export async function readArchive(file: File | Blob): Promise<JSZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new ImportError("That file is not a readable ZIP archive.");
  }
  return zip;
}

export async function importFromArchive(file: File | Blob): Promise<ImportResult> {
  const zip = await readArchive(file);
  const dataFile = zip.file("data.json");

  if (dataFile !== null) {
    const raw = await dataFile.async("string");
    let data: ExportData;
    try {
      data = JSON.parse(raw) as ExportData;
    } catch {
      throw new ImportError("data.json is present but not valid JSON.");
    }
    if (data.manifest?.formatVersion !== EXPORT_FORMAT_VERSION) {
      throw new ImportError(
        `This backup was written by a different version (format ${data.manifest?.formatVersion ?? "unknown"}).`,
      );
    }
    return restoreFull(data, zip);
  }

  return restoreMarkdownOnly(zip);
}

async function restoreFull(data: ExportData, zip: JSZip): Promise<ImportResult> {
  const database = db();
  const warnings: string[] = [];

  const notebooks = data.notebooks.map(toNotebookRow);
  const notes = data.notes;

  await database.transaction(
    "rw",
    [database.notebooks, database.notes, database.tags, database.noteTags, database.versions],
    async () => {
      await database.notebooks.bulkPut(notebooks);
      await database.notes.bulkPut(notes);
      if (data.tags.length > 0) await database.tags.bulkPut(data.tags);
      if (data.noteTags.length > 0) await database.noteTags.bulkPut(data.noteTags);
      if (data.versions.length > 0) await database.versions.bulkPut(data.versions);
    },
  );

  // Attachments are written outside the main transaction: they are the bulk of
  // the data, and a failure here must not roll back the notes themselves.
  const declared = data.attachments ?? [];
  let restoredAttachments = 0;

  for (const entry of declared) {
    const file = zip.file(entry.path);
    if (file === null) {
      warnings.push(`Attachment "${entry.fileName}" was listed but missing from the archive.`);
      continue;
    }
    const bytes = await file.async("uint8array");
    await database.attachments.put({
      id: entry.id,
      noteId: entry.noteId,
      fileName: entry.fileName,
      mime: entry.mime,
      size: entry.size,
      width: entry.width,
      height: entry.height,
      data: new Uint8Array(bytes),
      createdAt: entry.createdAt,
    });
    restoredAttachments += 1;
  }

  // Anything under attachments/ that data.json did not account for.
  const declaredPaths = new Set(declared.map((entry) => entry.path));
  const orphans = Object.keys(zip.files).filter(
    (path) => path.startsWith("attachments/") && !zip.files[path].dir && !declaredPaths.has(path),
  );
  if (orphans.length > 0) {
    warnings.push(
      `${orphans.length} file(s) under attachments/ were not listed in data.json and were skipped.`,
    );
  }

  // An archive exported before the UUID migration carries readable ids, which
  // Postgres rejects. The Dexie upgrade only runs once per version bump, so
  // remap on the way in: a restore must never reintroduce data that the
  // upgrade already fixed.
  await repairLocalIds(database);

  await touchDataVersion();

  return {
    mode: "full",
    notebooks: notebooks.length,
    notes: notes.length,
    attachments: restoredAttachments,
    tags: data.tags.length,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Markdown-only fallback                                              */
/* ------------------------------------------------------------------ */

interface ParsedNote {
  title: string;
  markdown: string;
  frontMatter: Record<string, string>;
}

export function parseMarkdownNote(source: string): ParsedNote {
  if (!source.startsWith("---")) {
    return { title: firstHeading(source) ?? "Untitled note", markdown: source, frontMatter: {} };
  }

  const end = source.indexOf("\n---", 3);
  if (end === -1) {
    return { title: firstHeading(source) ?? "Untitled note", markdown: source, frontMatter: {} };
  }

  const front = source.slice(3, end).trim();
  const body = source.slice(end + 4).trim();

  const frontMatter: Record<string, string> = {};
  for (const line of front.split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\"/g, '"');
    frontMatter[key] = value;
  }

  const title = frontMatter.title ?? firstHeading(body) ?? "Untitled note";
  return { title, markdown: body, frontMatter };
}

function firstHeading(source: string): string | null {
  const match = /^#{1,6}\s+(.+)$/m.exec(source);
  return match ? match[1].trim() : null;
}

async function restoreMarkdownOnly(zip: JSZip): Promise<ImportResult> {
  const markdownFiles = Object.keys(zip.files).filter(
    (path) => path.startsWith("notes/") && path.endsWith(".md"),
  );

  if (markdownFiles.length === 0) {
    throw new ImportError("This archive has neither data.json nor any notes/*.md files.");
  }

  const database = db();
  const { fromMarkdown } = await import("@/lib/tiptap/markdown");
  const { docToText } = await import("@/lib/tiptap/doc");
  const { toMarkdown } = await import("@/lib/tiptap/markdown");

  const warnings = [
    "This archive has no data.json, so version history, attachments and tag links were not restored.",
  ];

  // Recreate the notebook folder structure from the `notebook:` front matter.
  const notebooks = new Map<string, string>();
  const notes: ReturnType<typeof toNoteRow>[] = [];
  const timestamp = Date.now();

  for (const [index, path] of markdownFiles.entries()) {
    const parsed = parseMarkdownNote(await zip.files[path].async("string"));
    const doc = fromMarkdown(parsed.markdown);
    const created = Date.parse(parsed.frontMatter.created ?? "") || timestamp;
    const updated = Date.parse(parsed.frontMatter.updated ?? "") || created;

    let notebookId: string | null = null;
    const notebookName = parsed.frontMatter.notebook?.trim();
    if (notebookName !== undefined && notebookName !== "") {
      const existing = notebooks.get(notebookName);
      if (existing !== undefined) {
        notebookId = existing;
      } else {
        const id = crypto.randomUUID();
        notebooks.set(notebookName, id);
        notebookId = id;
      }
    }

    notes.push(
      toNoteRow({
        id: crypto.randomUUID(),
        notebookId,
        title: parsed.title,
        contentJson: doc,
        contentMarkdown: toMarkdown(doc),
        contentText: docToText(doc),
        isPinned: false,
        isTrashed: parsed.frontMatter.trashed === "true",
        trashedAt: null,
        version: 1,
        createdAt: created,
        updatedAt: updated,
      } satisfies Note),
    );
    void index;
  }

  const notebookRows: Notebook[] = [...notebooks.entries()].map(([name, id], index) => ({
    id,
    parentId: null,
    name,
    position: index,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  await database.transaction("rw", [database.notebooks, database.notes], async () => {
    await database.notebooks.bulkPut(notebookRows.map(toNotebookRow));
    await database.notes.bulkPut(notes);
  });
  await touchDataVersion();

  return {
    mode: "markdown",
    notebooks: notebookRows.length,
    notes: notes.length,
    attachments: 0,
    tags: 0,
    warnings,
  };
}
