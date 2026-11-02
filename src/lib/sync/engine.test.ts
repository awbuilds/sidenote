import { describe, expect, it } from "vitest";
import { withTestDb } from "@/lib/db/test-helpers";
import { db } from "@/lib/db/db";
import { createNotebook } from "@/lib/db/repositories/notebooks";
import { createNote, purgeNotes } from "@/lib/db/repositories/notes";
import { createTag, removeTagFromNote, setNoteTags } from "@/lib/db/repositories/tags";
import { addAttachment, deleteAttachment } from "@/lib/db/repositories/attachments";
import { listTombstones } from "@/lib/db/repositories/tombstones";
import { reconcile } from "./engine";
import { toRemoteNotebook, toRemoteNote, toRemoteTag } from "./mapping";
import type {
  RemoteAttachment,
  RemoteNote,
  RemoteNotebook,
  RemoteNoteTag,
  RemoteProfile,
  RemoteTag,
  SyncAdapter,
  SyncEntity,
} from "./types";

/**
 * In-memory stand-in for the PostgREST adapter. It stores what it is given and
 * reports the row's own `updated_at` as the server stamp — the real trigger
 * would move that stamp forward, which the engine already handles by aligning
 * the local row to the returned value.
 */
class FakeAdapter implements SyncAdapter {
  notebooks = new Map<string, RemoteNotebook>();
  tags = new Map<string, RemoteTag>();
  notes = new Map<string, RemoteNote>();
  noteTags = new Set<string>();
  profile: RemoteProfile = { displayName: "", updatedAt: 0 };
  pushed: string[] = [];
  deleted: string[] = [];

  async listManifest(table: SyncEntity): Promise<{ id: string; updatedAt: number }[]> {
    if (table === "notebooks") {
      return [...this.notebooks.values()].map((row) => ({
        id: row.id,
        updatedAt: Date.parse(row.updated_at),
      }));
    }
    if (table === "tags") {
      return [...this.tags.values()].map((row) => ({
        id: row.id,
        updatedAt: Date.parse(row.created_at),
      }));
    }
    return [...this.notes.values()].map((row) => ({
      id: row.id,
      updatedAt: Date.parse(row.updated_at),
    }));
  }

  private store<T extends { id: string }>(
    target: Map<string, T>,
    rows: T[],
    stampOf: (row: T) => string,
  ): Map<string, number> {
    const stamps = new Map<string, number>();
    for (const row of rows) {
      target.set(row.id, row);
      stamps.set(row.id, Date.parse(stampOf(row)));
      this.pushed.push(row.id);
    }
    return stamps;
  }

  async fetchNotebooks(ids: string[]): Promise<RemoteNotebook[]> {
    return ids.flatMap((id) => {
      const row = this.notebooks.get(id);
      return row ? [row] : [];
    });
  }

  async fetchTags(ids: string[]): Promise<RemoteTag[]> {
    return ids.flatMap((id) => {
      const row = this.tags.get(id);
      return row ? [row] : [];
    });
  }

  async fetchNotes(ids: string[]): Promise<RemoteNote[]> {
    return ids.flatMap((id) => {
      const row = this.notes.get(id);
      return row ? [row] : [];
    });
  }

  async upsertNotebooks(rows: RemoteNotebook[]): Promise<Map<string, number>> {
    return this.store(this.notebooks, rows, (row) => row.updated_at);
  }

  async upsertTags(rows: RemoteTag[]): Promise<Map<string, number>> {
    return this.store(this.tags, rows, (row) => row.created_at);
  }

  async upsertNotes(rows: RemoteNote[]): Promise<Map<string, number>> {
    return this.store(this.notes, rows, (row) => row.updated_at);
  }

  async deleteRows(table: SyncEntity, ids: string[]): Promise<void> {
    for (const id of ids) {
      this.deleted.push(`${table}:${id}`);
      if (table === "notebooks") this.notebooks.delete(id);
      else if (table === "tags") this.tags.delete(id);
      else this.notes.delete(id);
    }
  }

  async listNoteTags(): Promise<RemoteNoteTag[]> {
    return [...this.noteTags].map((key) => {
      const [note_id, tag_id] = key.split("|");
      return { note_id, tag_id };
    });
  }

  async upsertNoteTags(pairs: RemoteNoteTag[]): Promise<void> {
    for (const pair of pairs) this.noteTags.add(`${pair.note_id}|${pair.tag_id}`);
  }

  async deleteNoteTags(pairs: RemoteNoteTag[]): Promise<void> {
    for (const pair of pairs) this.noteTags.delete(`${pair.note_id}|${pair.tag_id}`);
  }

  async getProfile(): Promise<RemoteProfile | null> {
    return this.profile.displayName === "" ? null : this.profile;
  }

  async upsertProfile(displayName: string): Promise<void> {
    this.profile = { displayName, updatedAt: Date.now() };
  }

  attachments = new Map<string, RemoteAttachment>();
  attachmentBytes = new Map<string, Uint8Array>();

  async listAttachments(): Promise<RemoteAttachment[]> {
    return [...this.attachments.values()];
  }

  async uploadAttachment(
    row: Omit<RemoteAttachment, "path">,
    bytes: Uint8Array,
  ): Promise<void> {
    this.attachments.set(row.id, { ...row, path: `user/${row.id}/${row.file_name}` });
    this.attachmentBytes.set(row.id, bytes);
    this.pushed.push(row.id);
  }

  async downloadAttachment(path: string): Promise<Uint8Array> {
    const id = path.split("/")[1];
    const bytes = this.attachmentBytes.get(id);
    if (!bytes) throw new Error(`no bytes for ${path}`);
    return bytes;
  }

  async softDeleteAttachment(id: string, fileName: string): Promise<void> {
    const row = this.attachments.get(id);
    if (row) this.attachments.set(id, { ...row, deleted_at: new Date().toISOString() });
    this.deleted.push(`attachments:${id}:${fileName}`);
  }
}

describe("reconcile", () => {
  withTestDb();

  it("pushes local-only rows and maps sentinels to nulls", async () => {
    const parent = await createNotebook({ name: "Parent" });
    const child = await createNotebook({ name: "Child", parentId: parent.id });
    const tag = await createTag("smoke");
    const note = await createNote({ notebookId: child.id, title: "Hello", contentText: "world" });
    await setNoteTags(note.id, ["smoke"]);

    const remote = new FakeAdapter();
    const result = await reconcile(remote);

    expect(remote.notebooks.get(parent.id)?.parent_id).toBeNull();
    expect(remote.notebooks.get(child.id)?.parent_id).toBe(parent.id);
    expect(remote.notes.get(note.id)?.content_text).toBe("world");
    expect(remote.notes.get(note.id)?.is_trashed).toBe(false);
    expect(remote.noteTags.has(`${note.id}|${tag.id}`)).toBe(true);
    expect(result.pulled).toBe(0);
    expect(result.pushed).toBe(5);
  });

  it("pulls a newer remote note and keeps the local loser as a version", async () => {
    const notebook = await createNotebook({ name: "Notebook" });
    const note = await createNote({ notebookId: notebook.id, title: "Old", contentText: "old text" });

    const remote = new FakeAdapter();
    remote.notebooks.set(notebook.id, toRemoteNotebook((await db().notebooks.get(notebook.id))!));

    const remoteUpdated = note.updatedAt + 60_000;
    remote.notes.set(note.id, {
      ...toRemoteNote((await db().notes.get(note.id))!),
      title: "New",
      content_text: "new text",
      content_markdown: "new",
      version: 2,
      updated_at: new Date(remoteUpdated).toISOString(),
    });

    const result = await reconcile(remote);

    expect(result.pulled).toBeGreaterThanOrEqual(1);
    const local = await db().notes.get(note.id);
    expect(local?.title).toBe("New");
    expect(local?.contentText).toBe("new text");

    const versions = await db().versions.where("noteId").equals(note.id).toArray();
    expect(versions).toHaveLength(1);
    expect(versions[0].title).toBe("Old");
    expect(versions[0].contentText).toBe("old text");
  });

  it("does not ping-pong when timestamps are equal", async () => {
    const note = await createNote({ title: "Same" });
    const tag = await createTag("stable");
    const remote = new FakeAdapter();
    remote.notes.set(note.id, toRemoteNote((await db().notes.get(note.id))!));
    remote.tags.set(tag.id, toRemoteTag((await db().tags.get(tag.id))!));

    const result = await reconcile(remote);

    expect(result.pulled).toBe(0);
    expect(remote.pushed).not.toContain(note.id);
    // Tags are push-dominant by design; only assert notes here.
  });

  it("deletes tombstoned rows remotely and clears the tombstone", async () => {
    const note = await createNote({ title: "Doomed" });
    const remote = new FakeAdapter();
    remote.notes.set(note.id, toRemoteNote((await db().notes.get(note.id))!));

    await purgeNotes([note.id]);
    expect(await listTombstones()).toHaveLength(1);

    const result = await reconcile(remote);

    expect(result.deleted).toBe(1);
    expect(remote.notes.has(note.id)).toBe(false);
    expect(await listTombstones()).toHaveLength(0);
  });

  it("copies note_tags both ways and honours pair tombstones", async () => {
    const noteA = await createNote({ title: "A" });
    const tagA = await createTag("alpha");
    await setNoteTags(noteA.id, ["alpha"]);

    const noteB = await createNote({ title: "B" });
    const tagB = await createTag("beta");

    const remote = new FakeAdapter();
    remote.noteTags.add(`${noteB.id}|${tagB.id}`);

    await reconcile(remote);
    expect(remote.noteTags.has(`${noteA.id}|${tagA.id}`)).toBe(true);
    const localPairs = await db().noteTags.toArray();
    expect(localPairs.some((pair) => pair.noteId === noteB.id && pair.tagId === tagB.id)).toBe(true);

    await removeTagFromNote(noteA.id, tagA.id);
    await reconcile(remote);
    expect(remote.noteTags.has(`${noteA.id}|${tagA.id}`)).toBe(false);
  });

  it("round-trips attachment bytes in both directions", async () => {
    const note = await createNote({ title: "With image" });
    const attachment = await addAttachment({
      noteId: note.id,
      fileName: "photo.png",
      mime: "image/png",
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
    });

    const remote = new FakeAdapter();
    const remoteId = crypto.randomUUID();
    remote.attachments.set(remoteId, {
      id: remoteId,
      note_id: note.id,
      path: `user/${remoteId}/remote.png`,
      file_name: "remote.png",
      mime: "image/png",
      size_bytes: 3,
      width: null,
      height: null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    });
    remote.attachmentBytes.set(remoteId, new Uint8Array([9, 8, 7]));

    await reconcile(remote);

    expect(remote.attachments.get(attachment.id)?.size_bytes).toBe(4);
    const pulled = await db().attachments.get(remoteId);
    expect(pulled?.size).toBe(3);
    expect(Array.from(pulled?.data ?? [])).toEqual([9, 8, 7]);
  });

  it("propagates a remote soft delete to the local copy without re-uploading", async () => {
    const note = await createNote({ title: "Doomed image" });
    const attachment = await addAttachment({
      noteId: note.id,
      fileName: "gone.png",
      mime: "image/png",
      blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
    });

    const remote = new FakeAdapter();
    remote.attachments.set(attachment.id, {
      id: attachment.id,
      note_id: note.id,
      path: `user/${attachment.id}/gone.png`,
      file_name: "gone.png",
      mime: "image/png",
      size_bytes: 1,
      width: null,
      height: null,
      created_at: new Date(attachment.createdAt).toISOString(),
      deleted_at: new Date().toISOString(),
    });

    const result = await reconcile(remote);

    expect(await db().attachments.get(attachment.id)).toBeUndefined();
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(remote.pushed).not.toContain(attachment.id);
  });

  it("deletes an attachment remotely through a tombstone", async () => {
    const note = await createNote({ title: "Delete me" });
    const attachment = await addAttachment({
      noteId: note.id,
      fileName: "bye.png",
      mime: "image/png",
      blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
    });

    const remote = new FakeAdapter();
    remote.attachments.set(attachment.id, {
      id: attachment.id,
      note_id: note.id,
      path: `user/${attachment.id}/bye.png`,
      file_name: "bye.png",
      mime: "image/png",
      size_bytes: 1,
      width: null,
      height: null,
      created_at: new Date(attachment.createdAt).toISOString(),
      deleted_at: null,
    });

    await deleteAttachment(attachment.id);
    expect(await listTombstones()).toHaveLength(1);

    await reconcile(remote);

    expect(remote.attachments.get(attachment.id)?.deleted_at).not.toBeNull();
    expect(await listTombstones()).toHaveLength(0);
    expect(await db().attachments.get(attachment.id)).toBeUndefined();
  });
});
