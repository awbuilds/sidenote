import type { JSONContent } from "@tiptap/core";
import type { Theme } from "@/lib/theme";
import { DEFAULT_THEME } from "@/lib/theme";
import type { EditorFont, EditorLineHeight, EditorWidth } from "@/lib/typography";

export type NotebookId = string;
export type NoteId = string;
export type TagId = string;
export type AttachmentId = string;

/** IndexedDB cannot index booleans — valid keys are numbers, strings, dates,
 *  binaries and arrays. Indexed flags are persisted as `0 | 1` in `NoteRow`
 *  and surfaced as booleans on the domain `Note`. Do not index a boolean. */
export type Flag = 0 | 1;

/**
 * `null` is *also* an invalid IndexedDB key, so a nullable foreign key cannot
 * be queried with `where(...).equals(null)`. Nullable parents are persisted as
 * the empty string and surfaced as `null` on the domain types. Use these
 * helpers rather than hardcoding the sentinel.
 */
export const ROOT = "";

export function toStorageId(id: string | null | undefined): string {
  return id ?? ROOT;
}

export function fromStorageId(id: string | null | undefined): string | null {
  return id === ROOT || id === null || id === undefined ? null : id;
}

export interface Notebook {
  id: NotebookId;
  /** `null` for a top-level notebook. */
  parentId: NotebookId | null;
  name: string;
  /** Sort order among siblings. Sparse — reindexed by `reorderNotebooks`. */
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: NoteId;
  /** `null` for an unfiled note. */
  notebookId: NotebookId | null;
  title: string;
  /** Authoritative content. `contentMarkdown` and `contentText` are derived. */
  contentJson: JSONContent;
  contentMarkdown: string;
  contentText: string;
  isPinned: boolean;
  isTrashed: boolean;
  trashedAt: number | null;
  /** Bumped on every content write. Guards against lost updates. */
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: TagId;
  /** Always stored lowercased — it is the dedup key. */
  name: string;
  color: string;
  createdAt: number;
}

export interface NoteTag {
  id: string;
  noteId: NoteId;
  tagId: TagId;
}

export interface Attachment {
  id: AttachmentId;
  noteId: NoteId;
  fileName: string;
  mime: string;
  /** Bytes, after compression. */
  size: number;
  width: number | null;
  height: number | null;
  /**
   * The bytes, not a `Blob`.
   *
   * IndexedDB stores both, but a Blob does not survive every environment's
   * structured clone — `fake-indexeddb` degrades it to a plain object, which
   * would leave the backup path (the only copy of this data) untestable. At a
   * 5 MB cap the memory advantage of a Blob is not worth losing the ability to
   * verify a restore round trip.
   */
  data: Uint8Array;
  createdAt: number;
}

export interface NoteVersion {
  id: string;
  noteId: NoteId;
  title: string;
  contentJson: JSONContent;
  contentMarkdown: string;
  contentText: string;
  version: number;
  createdAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

/** The serialized search index, single row keyed `current`. */
export interface SearchIndexRow {
  key: string;
  /** `JSON.stringify(miniSearch)` */
  serialized: string;
  /** `settings.dataVersion` this index was built from. */
  dataVersion: number;
  documentCount: number;
}

/**
 * An outgoing `[[wiki link]]` from one note to another.
 *
 * `targetId` is null when the link names a note that does not exist (yet), so
 * the reference survives and resolves when that note is later created.
 */
export interface NoteLink {
  id: string;
  sourceId: NoteId;
  targetId: NoteId | null;
  targetTitle: string;
  createdAt: number;
}

/** `targetId` is `""` when unresolved — IndexedDB rejects `null` as a key. */
export interface NoteLinkRow {
  id: string;
  sourceId: NoteId;
  targetId: string;
  targetTitle: string;
  createdAt: number;
}

/**
 * A local deletion waiting to reach the server. `ref` is the row id, except
 * for `note_tags` where it is `"{note_id}|{tag_id}"`. See
 * `repositories/tombstones.ts`.
 */
export interface TombstoneRow {
  key: string;
  table: "notebooks" | "tags" | "notes" | "note_tags" | "attachments";
  ref: string;
  deletedAt: number;
}

/* ------------------------------------------------------------------ */
/* Row shapes — what actually lands in IndexedDB                      */
/* ------------------------------------------------------------------ */

export type NotebookRow = Omit<Notebook, "parentId"> & { parentId: string };

export type NoteRow = Omit<Note, "isPinned" | "isTrashed" | "notebookId"> & {
  isPinned: Flag;
  isTrashed: Flag;
  notebookId: string;
};

/* ------------------------------------------------------------------ */
/* Settings keys                                                      */
/* ------------------------------------------------------------------ */

export interface AppSettings {
  profileName: string;
  /**
   * Referenced rather than spelled out. It was a literal union here as well as
   * in `lib/theme.ts`, and the two had to be kept in step by hand — the test
   * that claimed to guard this compared a hardcoded array against itself and
   * could not have caught the divergence. `lib/theme.ts` imports nothing from
   * the data layer, so pointing at it adds no dependency edge.
   */
  theme: Theme;
  /** Hide the notebook and list panes, leaving only the editor. */
  focusMode: boolean;
  /** Max retained snapshots per note before pruning. */
  versionLimit: number;
  /** Snapshots older than this are pruned regardless of count. */
  versionMaxAgeDays: number;
  lastNotebookId: NotebookId | null;
  /** Bumped whenever note content changes; invalidates the search index. */
  dataVersion: number;
  seeded: boolean;
  /** First-run getting-started card; once dismissed it stays gone. */
  onboardingDismissed: boolean;
  /** Timestamp of the last successful ZIP export, for the checklist. */
  lastBackupAt: number | null;
  /** Note list row density. */
  listDensity: ListDensity;
  /** Editor reading column preferences. */
  editorFont: EditorFont;
  editorWidth: EditorWidth;
  editorLineHeight: EditorLineHeight;
}

export type ListDensity = "comfortable" | "compact";

export const DEFAULT_SETTINGS: AppSettings = {
  profileName: "",
  /** See `DEFAULT_THEME` — only a brand-new database ever sees this. */
  theme: DEFAULT_THEME,
  focusMode: false,
  versionLimit: 30,
  versionMaxAgeDays: 90,
  lastNotebookId: null,
  dataVersion: 0,
  seeded: false,
  onboardingDismissed: false,
  lastBackupAt: null,
  listDensity: "comfortable",
  editorFont: "sans",
  editorWidth: "medium",
  editorLineHeight: "normal",
};

/* ------------------------------------------------------------------ */
/* Tree view models                                                    */
/* ------------------------------------------------------------------ */

export interface NotebookNode extends Notebook {
  depth: number;
  children: NotebookNode[];
  noteCount: number;
  /** Total notes in this notebook and all descendants. */
  totalNoteCount: number;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";
