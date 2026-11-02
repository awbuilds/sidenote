import type { NoteRow, NotebookRow, Tag } from "@/lib/db/types";
import type { RemoteNote, RemoteNotebook, RemoteTag } from "./types";

/* The wire format is the Postgres schema: snake_case, ISO timestamps,
 * booleans, and real NULLs. The local format is the Dexie schema: camelCase,
 * epoch milliseconds, `0 | 1` flags and the `""` null sentinel. These are the
 * only places those two dialects meet. */

export function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function msFromIso(iso: string): number {
  return Date.parse(iso);
}

export function toRemoteNotebook(row: NotebookRow): RemoteNotebook {
  return {
    id: row.id,
    parent_id: row.parentId === "" ? null : row.parentId,
    name: row.name,
    position: row.position,
    created_at: isoFromMs(row.createdAt),
    updated_at: isoFromMs(row.updatedAt),
  };
}

export function fromRemoteNotebook(row: RemoteNotebook): NotebookRow {
  return {
    id: row.id,
    parentId: row.parent_id ?? "",
    name: row.name,
    position: row.position,
    createdAt: msFromIso(row.created_at),
    updatedAt: msFromIso(row.updated_at),
  };
}

export function toRemoteTag(row: Tag): RemoteTag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    created_at: isoFromMs(row.createdAt),
  };
}

export function fromRemoteTag(row: RemoteTag): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: msFromIso(row.created_at),
  };
}

export function toRemoteNote(row: NoteRow): RemoteNote {
  return {
    id: row.id,
    notebook_id: row.notebookId === "" ? null : row.notebookId,
    title: row.title,
    content_json: row.contentJson,
    content_markdown: row.contentMarkdown,
    content_text: row.contentText,
    is_pinned: row.isPinned === 1,
    is_trashed: row.isTrashed === 1,
    trashed_at: row.trashedAt === null ? null : isoFromMs(row.trashedAt),
    version: row.version,
    created_at: isoFromMs(row.createdAt),
    updated_at: isoFromMs(row.updatedAt),
  };
}

export function fromRemoteNote(row: RemoteNote): NoteRow {
  return {
    id: row.id,
    notebookId: row.notebook_id ?? "",
    title: row.title,
    contentJson: row.content_json,
    contentMarkdown: row.content_markdown,
    contentText: row.content_text,
    isPinned: row.is_pinned ? 1 : 0,
    isTrashed: row.is_trashed ? 1 : 0,
    trashedAt: row.trashed_at === null ? null : msFromIso(row.trashed_at),
    version: row.version,
    createdAt: msFromIso(row.created_at),
    updatedAt: msFromIso(row.updated_at),
  };
}
