import Dexie, { type Table } from "dexie";
import type { JSONContent } from "@tiptap/core";
import { remapNonUuidIds } from "./migrate-ids";
import type { NoteLinkRow, SearchIndexRow, TombstoneRow } from "./types";
import type {
  Attachment,
  NoteRow,
  NoteTag,
  NoteVersion,
  NotebookRow,
  SettingRow,
  Tag,
} from "./types";

export const DB_NAME = "sidenote";

/**
 * The only module in the app that imports Dexie. Everything else goes through
 * `src/lib/db/repositories/*`.
 *
 * Notes on the schema:
 *  - `isPinned` / `isTrashed` are `0 | 1` numbers, not booleans. IndexedDB
 *    rejects booleans as keys, so a boolean column simply cannot be indexed.
 *  - Attachment blobs are stored inline. This is the only place the storage
 *    quota can bite, so every write path that touches `attachments` must let
 *    `QuotaExceededError` propagate to a caller that reports it.
 *  - Schema changes are append-only: bump the version number and add a
 *    migration block. Never edit an existing `stores()` in place.
 */
export class NotesDatabase extends Dexie {
  declare notebooks: Table<NotebookRow, string>;
  declare notes: Table<NoteRow, string>;
  declare tags: Table<Tag, string>;
  declare noteTags: Table<NoteTag, string>;
  declare attachments: Table<Attachment, string>;
  declare versions: Table<NoteVersion, string>;
  declare settings: Table<SettingRow, string>;
  /** Serialized MiniSearch index, one row. See `src/lib/search`. */
  declare searchIndex: Table<SearchIndexRow, string>;
  /** Outgoing `[[wiki links]]`, rebuilt whenever a note is saved. */
  declare noteLinks: Table<NoteLinkRow, string>;
  /** Local deletions waiting to be applied remotely. See sync. */
  declare tombstones: Table<TombstoneRow, string>;

  constructor(name: string = DB_NAME) {
    super(name);

    this.version(1).stores({
      notebooks: "id, parentId, position, updatedAt",
      notes:
        "id, notebookId, isTrashed, isPinned, updatedAt, createdAt, " +
        "[notebookId+isTrashed], [isTrashed+updatedAt], [notebookId+isPinned]",
      tags: "id, name, createdAt",
      noteTags: "id, noteId, tagId, &[noteId+tagId]",
      attachments: "id, noteId, createdAt",
      versions: "id, noteId, version, createdAt, &[noteId+version]",
      settings: "key",
    });

    // v2 adds the persisted search index. Tables declared in earlier versions
    // are carried forward untouched — Dexie only needs the additions here, but
    // the full set is repeated so the current schema is readable in one place.
    this.version(2).stores({
      notebooks: "id, parentId, position, updatedAt",
      notes:
        "id, notebookId, isTrashed, isPinned, updatedAt, createdAt, " +
        "[notebookId+isTrashed], [isTrashed+updatedAt], [notebookId+isPinned]",
      tags: "id, name, createdAt",
      noteTags: "id, noteId, tagId, &[noteId+tagId]",
      attachments: "id, noteId, createdAt",
      versions: "id, noteId, version, createdAt, &[noteId+version]",
      settings: "key",
      searchIndex: "key",
    });

    // v3 adds bi-directional note links.
    this.version(3).stores({
      notebooks: "id, parentId, position, updatedAt",
      notes:
        "id, notebookId, isTrashed, isPinned, updatedAt, createdAt, " +
        "[notebookId+isTrashed], [isTrashed+updatedAt], [notebookId+isPinned]",
      tags: "id, name, createdAt",
      noteTags: "id, noteId, tagId, &[noteId+tagId]",
      attachments: "id, noteId, createdAt",
      versions: "id, noteId, version, createdAt, &[noteId+version]",
      settings: "key",
      searchIndex: "key",
      noteLinks: "id, sourceId, targetId, targetTitle, &[sourceId+targetId]",
    });

    // v4 adds tombstones for sync — local deletions that still need to reach
    // the server. Append-only, like every schema change.
    this.version(4).stores({
      notebooks: "id, parentId, position, updatedAt",
      notes:
        "id, notebookId, isTrashed, isPinned, updatedAt, createdAt, " +
        "[notebookId+isTrashed], [isTrashed+updatedAt], [notebookId+isPinned]",
      tags: "id, name, createdAt",
      noteTags: "id, noteId, tagId, &[noteId+tagId]",
      attachments: "id, noteId, createdAt",
      versions: "id, noteId, version, createdAt, &[noteId+version]",
      settings: "key",
      searchIndex: "key",
      noteLinks: "id, sourceId, targetId, targetTitle, &[sourceId+targetId]",
      tombstones: "key, table, deletedAt",
    });

    // v5 repairs pre-backend sample data: readable ids (`seed-note-0`) cannot
    // be pushed to Postgres `uuid` columns, so they are remapped in place,
    // references and all. No schema change — the stores are repeated verbatim.
    this.version(5)
      .stores({
        notebooks: "id, parentId, position, updatedAt",
        notes:
          "id, notebookId, isTrashed, isPinned, updatedAt, createdAt, " +
          "[notebookId+isTrashed], [isTrashed+updatedAt], [notebookId+isPinned]",
        tags: "id, name, createdAt",
        noteTags: "id, noteId, tagId, &[noteId+tagId]",
        attachments: "id, noteId, createdAt",
        versions: "id, noteId, version, createdAt, &[noteId+version]",
        settings: "key",
        searchIndex: "key",
        noteLinks: "id, sourceId, targetId, targetTitle, &[sourceId+targetId]",
        tombstones: "key, table, deletedAt",
      })
      .upgrade(async () => {
        await remapNonUuidIds(this);
      });

    // v6 adds an index-only projection for note titles. Dexie cannot select a
    // field, so `orderBy("[isTrashed+title+id]").keys()` is how the title
    // resolver and the wiki-link index read thousands of titles without
    // materialising every note body. Index creation only — no row rewrite.
    this.version(6).stores({
      notebooks: "id, parentId, position, updatedAt",
      notes:
        "id, notebookId, isTrashed, isPinned, updatedAt, createdAt, " +
        "[notebookId+isTrashed], [isTrashed+updatedAt], [notebookId+isPinned], " +
        "[isTrashed+title+id], [isTrashed+notebookId]",
      tags: "id, name, createdAt",
      noteTags: "id, noteId, tagId, &[noteId+tagId]",
      attachments: "id, noteId, createdAt",
      versions: "id, noteId, version, createdAt, &[noteId+version]",
      settings: "key",
      searchIndex: "key",
      noteLinks: "id, sourceId, targetId, targetTitle, &[sourceId+targetId]",
      tombstones: "key, table, deletedAt",
    });
  }
}

let instance: NotesDatabase | null = null;

/**
 * Lazily created singleton. `NotesDatabase` is not opened at module scope so
 * that importing this module in a server context is side-effect free.
 */
export function db(): NotesDatabase {
  if (instance === null) instance = new NotesDatabase();
  return instance;
}

/** Test helper: swap or reset the singleton. */
export function __setDatabase(next: NotesDatabase | null): void {
  instance = next;
}

/** A fresh, valid TipTap document. */
export function emptyDoc(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}
