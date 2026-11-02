import { db } from "@/lib/db/db";
import type { NoteRow, NotebookRow } from "@/lib/db/types";
import { getSettings, setSetting, touchDataVersion } from "@/lib/db/repositories/settings";
import { rebuildLinksForNote, resolvePendingLinks } from "@/lib/db/repositories/links";
import {
  fromRemoteNote,
  fromRemoteNotebook,
  fromRemoteTag,
  isoFromMs,
  toRemoteNote,
  toRemoteNotebook,
  toRemoteTag,
} from "./mapping";
import {
  clearTombstones,
  listTombstones,
  parseAttachmentRef,
  parseNoteTagRef,
} from "@/lib/db/repositories/tombstones";
import type { SyncAdapter, SyncResult } from "./types";

/**
 * Stateless last-write-wins reconciliation.
 *
 * Each pass pulls a cheap id/updated_at manifest, then:
 *  - tombstones are deleted remotely first, so a local deletion cannot be
 *    "pulled back" as a remote-only row;
 *  - rows only one side knows about are copied to the other side;
 *  - rows both sides know about go to whichever side has the newer
 *    `updated_at`, with a small grace window so sub-second round trips do not
 *    ping-pong.
 *
 * When a remote note overwrites a local one whose content actually differs,
 * the local content is preserved as a version snapshot first — the loser of a
 * conflict is never silently discarded.
 */
const GRACE_MS = 1000;

export async function reconcile(adapter: SyncAdapter): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, deleted: 0 };

  await syncProfile(adapter);
  result.deleted += await flushTombstones(adapter);

  /* Notebooks first: notes reference them. */
  {
    const local = await db().notebooks.toArray();
    const manifest = await manifestMap(adapter, "notebooks");
    const byId = new Map(local.map((row) => [row.id, row]));
    const pullIds = [...manifest.keys()].filter((id) => {
      const row = byId.get(id);
      return row === undefined || manifest.get(id)! > row.updatedAt + GRACE_MS;
    });

    if (pullIds.length > 0) {
      const remote = await adapter.fetchNotebooks(pullIds);
      await db().notebooks.bulkPut(remote.map(fromRemoteNotebook));
      result.pulled += remote.length;
    }

    const pushRows = local.filter((row) => {
      const stamp = manifest.get(row.id);
      return stamp === undefined || row.updatedAt > stamp + GRACE_MS;
    });
    if (pushRows.length > 0) {
      const stamps = await adapter.upsertNotebooks(pushRows.map(toRemoteNotebook));
      await alignNotebookStamps(pushRows, stamps);
      result.pushed += pushRows.length;
    }
  }

  /* Tags: push-dominant.
   *
   * `Tag` has no `updatedAt`, so a rename cannot be told apart from an
   * untouched row. Instead of inventing a second timestamp, tags are copied
   * down only when missing locally and pushed up on every pass — an upsert is
   * idempotent and there are only ever a few dozen tags. */
  {
    const local = await db().tags.toArray();
    const manifest = await manifestMap(adapter, "tags");
    const known = new Set(local.map((row) => row.id));

    const pullIds = [...manifest.keys()].filter((id) => !known.has(id));
    if (pullIds.length > 0) {
      const remote = await adapter.fetchTags(pullIds);
      await db().tags.bulkPut(remote.map(fromRemoteTag));
      result.pulled += remote.length;
    }

    if (local.length > 0) {
      await adapter.upsertTags(local.map(toRemoteTag));
      result.pushed += local.length;
    }
  }

  /* Notes. */
  {
    const local = await db().notes.toArray();
    const manifest = await manifestMap(adapter, "notes");
    const byId = new Map(local.map((row) => [row.id, row]));
    const pullIds = [...manifest.keys()].filter((id) => {
      const row = byId.get(id);
      return row === undefined || manifest.get(id)! > row.updatedAt + GRACE_MS;
    });

    if (pullIds.length > 0) {
      const remote = await adapter.fetchNotes(pullIds);
      const remoteById = new Map(remote.map((row) => [row.id, row]));
      const conflicts: NoteRow[] = [];
      for (const id of pullIds) {
        const localRow = byId.get(id);
        const remoteRow = remoteById.get(id);
        if (localRow && remoteRow && noteContentDiffers(localRow, remoteRow)) {
          conflicts.push(localRow);
        }
      }
      if (conflicts.length > 0) await preserveAsVersions(conflicts);
      await db().notes.bulkPut(remote.map(fromRemoteNote));
      for (const note of remote) {
        await rebuildLinksForNote(note.id, note.content_text);
      }
      result.pulled += remote.length;
    }

    const pushRows = local.filter((row) => {
      const stamp = manifest.get(row.id);
      return stamp === undefined || row.updatedAt > stamp + GRACE_MS;
    });
    if (pushRows.length > 0) {
      const stamps = await adapter.upsertNotes(pushRows.map(toRemoteNote));
      await alignNoteStamps(pushRows, stamps);
      result.pushed += pushRows.length;
    }
  }

  /* Attachments: metadata + bytes. After notes, because the FK must exist. */
  {
    const attachments = await syncAttachments(adapter);
    result.pushed += attachments.pushed;
    result.pulled += attachments.pulled;
    result.deleted += attachments.deleted;
  }

  /* Join rows last: both endpoints exist remotely by now. */
  result.pushed += await syncNoteTags(adapter);

  if (result.pulled > 0) {
    await touchDataVersion();
    await resolvePendingLinks();
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function manifestMap(adapter: SyncAdapter, table: "notebooks" | "tags" | "notes") {
  const rows = await adapter.listManifest(table);
  return new Map(rows.map((row) => [row.id, row.updatedAt]));
}

async function syncProfile(adapter: SyncAdapter): Promise<void> {
  const settings = await getSettings();
  const remote = await adapter.getProfile();
  const local = settings.profileName.trim();

  if (local === "" && remote && remote.displayName !== "") {
    await setSetting("profileName", remote.displayName);
  } else if (local !== "" && local !== (remote?.displayName ?? "")) {
    await adapter.upsertProfile(local);
  }
}

async function flushTombstones(adapter: SyncAdapter): Promise<number> {
  const tombstones = await listTombstones();
  if (tombstones.length === 0) return 0;

  let deleted = 0;
  const cleared: string[] = [];
  for (const tombstone of tombstones) {
    if (tombstone.table === "note_tags") {
      const { noteId, tagId } = parseNoteTagRef(tombstone.ref);
      await adapter.deleteNoteTags([{ note_id: noteId, tag_id: tagId }]);
    } else if (tombstone.table === "attachments") {
      const { id, fileName } = parseAttachmentRef(tombstone.ref);
      await adapter.softDeleteAttachment(id, fileName);
    } else {
      await adapter.deleteRows(tombstone.table, [tombstone.ref]);
    }
    cleared.push(tombstone.key);
    deleted += 1;
  }
  await clearTombstones(cleared);
  return deleted;
}

/** Does the remote copy actually carry different content from local? */
function noteContentDiffers(local: NoteRow, remote: { title: string; content_json: unknown; content_text: string; is_trashed: boolean }): boolean {
  return (
    local.title !== remote.title ||
    local.contentText !== remote.content_text ||
    local.isTrashed !== (remote.is_trashed ? 1 : 0) ||
    JSON.stringify(local.contentJson) !== JSON.stringify(remote.content_json)
  );
}

/**
 * Keep the local loser of a conflict as a version snapshot so the force of a
 * pull never destroys work. Snapshot versions are written behind the current
 * one; the normal save-time pruner trims them later.
 */
async function preserveAsVersions(notes: NoteRow[]): Promise<void> {
  const database = db();
  await database.transaction("rw", [database.versions], async () => {
    for (const note of notes) {
      const existing = await database.versions.where("noteId").equals(note.id).toArray();
      const highest = existing.reduce((max, row) => Math.max(max, row.version), note.version);
      await database.versions.put({
        id: crypto.randomUUID(),
        noteId: note.id,
        title: note.title,
        contentJson: note.contentJson,
        contentMarkdown: note.contentMarkdown,
        contentText: note.contentText,
        version: highest + 1,
        createdAt: Date.now(),
      });
    }
  });
}

async function alignNotebookStamps(rows: NotebookRow[], stamps: Map<string, number>): Promise<void> {
  const changed = rows.filter((row) => {
    const stamp = stamps.get(row.id);
    return stamp !== undefined && stamp !== row.updatedAt;
  });
  if (changed.length === 0) return;
  const database = db();
  await database.transaction("rw", [database.notebooks], async () => {
    for (const row of changed) {
      await database.notebooks.update(row.id, { updatedAt: stamps.get(row.id)! });
    }
  });
}

async function alignNoteStamps(rows: NoteRow[], stamps: Map<string, number>): Promise<void> {
  const changed = rows.filter((row) => {
    const stamp = stamps.get(row.id);
    return stamp !== undefined && stamp !== row.updatedAt;
  });
  if (changed.length === 0) return;
  const database = db();
  await database.transaction("rw", [database.notes], async () => {
    for (const row of changed) {
      await database.notes.update(row.id, { updatedAt: stamps.get(row.id)! });
    }
  });
}

/**
 * Attachments move bytes, not just metadata:
 *  - a remote soft delete removes the local copy, which is how a deletion
 *    propagates across devices;
 *  - metadata this device has never seen is downloaded (signed URL) before
 *    being inserted, because the local record holds the bytes inline;
 *  - local rows the server has never seen are uploaded (storage object +
 *    metadata row). Soft-deleted remote rows stay in the manifest, so this
 *    never resurrects something the user deleted elsewhere.
 */
async function syncAttachments(
  adapter: SyncAdapter,
): Promise<{ pushed: number; pulled: number; deleted: number }> {
  const database = db();
  const [local, remote] = await Promise.all([
    database.attachments.toArray(),
    adapter.listAttachments(),
  ]);
  const remoteById = new Map(remote.map((row) => [row.id, row]));
  const localIds = new Set(local.map((row) => row.id));

  let pushed = 0;
  let pulled = 0;
  let deleted = 0;

  for (const row of remote) {
    if (row.deleted_at !== null && localIds.has(row.id)) {
      await database.attachments.delete(row.id);
      deleted += 1;
    }
  }

  for (const row of remote) {
    if (row.deleted_at !== null || localIds.has(row.id)) continue;
    const data = await adapter.downloadAttachment(row.path);
    await database.attachments.put({
      id: row.id,
      noteId: row.note_id,
      fileName: row.file_name,
      mime: row.mime,
      size: row.size_bytes,
      width: row.width,
      height: row.height,
      data,
      createdAt: Date.parse(row.created_at),
    });
    pulled += 1;
  }

  for (const row of local) {
    if (remoteById.has(row.id)) continue;
    await adapter.uploadAttachment(
      {
        id: row.id,
        note_id: row.noteId,
        file_name: row.fileName,
        mime: row.mime,
        size_bytes: row.size,
        width: row.width,
        height: row.height,
        created_at: isoFromMs(row.createdAt),
        deleted_at: null,
      },
      row.data,
    );
    pushed += 1;
  }

  return { pushed, pulled, deleted };
}

/**
 * note_tags has no timestamps, so it cannot be reconciled by LWW. Additions
 * copy both ways; removals propagate through tombstones only (recorded by
 * `setNoteTags` / `removeTagFromNote`). That means a remote-only tag left over
 * from a delete made on another device is re-pulled rather than deleted —
 * acceptable for v1 and documented in the handoff.
 */
async function syncNoteTags(adapter: SyncAdapter): Promise<number> {
  const [links, remotePairs, notes] = await Promise.all([
    db().noteTags.toArray(),
    adapter.listNoteTags(),
    db().notes.toArray(),
  ]);

  const localKeys = new Set(links.map((link) => `${link.noteId}|${link.tagId}`));
  const remoteKeys = new Set(remotePairs.map((pair) => `${pair.note_id}|${pair.tag_id}`));

  const toPush = links.filter((link) => !remoteKeys.has(`${link.noteId}|${link.tagId}`));
  if (toPush.length > 0) {
    await adapter.upsertNoteTags(toPush.map((link) => ({ note_id: link.noteId, tag_id: link.tagId })));
  }

  const noteIds = new Set(notes.map((note) => note.id));
  const toPull = remotePairs.filter(
    (pair) => !localKeys.has(`${pair.note_id}|${pair.tag_id}`) && noteIds.has(pair.note_id),
  );
  if (toPull.length > 0) {
    await db().noteTags.bulkPut(
      toPull.map((pair) => ({
        id: `${pair.note_id}:${pair.tag_id}`,
        noteId: pair.note_id,
        tagId: pair.tag_id,
      })),
    );
  }

  return toPush.length;
}
