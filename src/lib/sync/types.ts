import type { JSONContent } from "@tiptap/core";

/** Tables that participate in two-way sync. Attachments and versions are
 *  deliberately excluded from v1 (bytes need Storage; snapshots are history). */
export type SyncEntity = "notebooks" | "tags" | "notes";

export interface RemoteNotebook {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface RemoteTag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface RemoteNote {
  id: string;
  notebook_id: string | null;
  title: string;
  content_json: JSONContent;
  content_markdown: string;
  content_text: string;
  is_pinned: boolean;
  is_trashed: boolean;
  trashed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RemoteNoteTag {
  note_id: string;
  tag_id: string;
}

export interface RemoteProfile {
  displayName: string;
  updatedAt: number;
}

/**
 * Attachment metadata. Bytes live in the private `attachments` bucket; the
 * local record holds them inline instead. `deleted_at` is a soft delete so a
 * deletion on one device can propagate to the others (a hard delete would be
 * indistinguishable from "never uploaded").
 */
export interface RemoteAttachment {
  id: string;
  note_id: string;
  path: string;
  file_name: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
  deleted_at: string | null;
}

/**
 * Everything the reconcile loop needs from the network.
 *
 * Kept as an interface so the engine is testable against an in-memory fake —
 * no Supabase client, no fetch, no network in unit tests.
 */
export interface SyncAdapter {
  listManifest(table: SyncEntity): Promise<{ id: string; updatedAt: number }[]>;
  fetchNotebooks(ids: string[]): Promise<RemoteNotebook[]>;
  fetchTags(ids: string[]): Promise<RemoteTag[]>;
  fetchNotes(ids: string[]): Promise<RemoteNote[]>;
  /** Returns the server's `updated_at` per id, so local clocks can align. */
  upsertNotebooks(rows: RemoteNotebook[]): Promise<Map<string, number>>;
  upsertTags(rows: RemoteTag[]): Promise<Map<string, number>>;
  upsertNotes(rows: RemoteNote[]): Promise<Map<string, number>>;
  deleteRows(table: SyncEntity, ids: string[]): Promise<void>;
  listNoteTags(): Promise<RemoteNoteTag[]>;
  upsertNoteTags(pairs: RemoteNoteTag[]): Promise<void>;
  deleteNoteTags(pairs: RemoteNoteTag[]): Promise<void>;
  getProfile(): Promise<RemoteProfile | null>;
  upsertProfile(displayName: string): Promise<void>;

  listAttachments(): Promise<RemoteAttachment[]>;
  uploadAttachment(row: Omit<RemoteAttachment, "path">, bytes: Uint8Array): Promise<void>;
  downloadAttachment(path: string): Promise<Uint8Array>;
  softDeleteAttachment(id: string, fileName: string): Promise<void>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  deleted: number;
}
