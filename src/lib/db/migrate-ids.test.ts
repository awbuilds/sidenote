import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/uuid";
import { db } from "./db";
import { remapNonUuidIds } from "./migrate-ids";
import { withTestDb } from "./test-helpers";

/**
 * The v5 upgrade repairs databases that predate the backend. These tests call
 * the upgrade body directly (the schema they run against is already v5), which
 * exercises the same code path.
 */
describe("remapNonUuidIds", () => {
  withTestDb();

  it("rewrites seed-style ids and every reference to them", async () => {
    const database = db();

    await database.notebooks.bulkPut([
      { id: "seed-notebook-work", parentId: "", name: "Work", position: 0, createdAt: 1, updatedAt: 1 },
      { id: "seed-notebook-engineering", parentId: "seed-notebook-work", name: "Engineering", position: 1, createdAt: 2, updatedAt: 2 },
    ]);
    await database.notes.put({
      id: "seed-note-0",
      notebookId: "seed-notebook-engineering",
      title: "Hi",
      contentJson: { type: "doc" },
      contentMarkdown: "",
      contentText: "",
      isPinned: 0,
      isTrashed: 0,
      trashedAt: null,
      version: 1,
      createdAt: 3,
      updatedAt: 3,
    });
    await database.tags.put({ id: "seed-tag-alpha", name: "alpha", color: "slate", createdAt: 4 });
    await database.noteTags.put({ id: "link-1", noteId: "seed-note-0", tagId: "seed-tag-alpha" });
    await database.attachments.put({
      id: "seed-attachment-0-0",
      noteId: "seed-note-0",
      fileName: "demo.svg",
      mime: "image/svg+xml",
      size: 1,
      width: null,
      height: null,
      data: new Uint8Array([1]),
      createdAt: 5,
    });
    await database.versions.put({
      id: crypto.randomUUID(),
      noteId: "seed-note-0",
      title: "snapshot",
      contentJson: { type: "doc" },
      contentMarkdown: "",
      contentText: "",
      version: 1,
      createdAt: 6,
    });
    await database.noteLinks.put({
      id: crypto.randomUUID(),
      sourceId: "seed-note-0",
      targetId: "seed-note-1",
      targetTitle: "Other",
      createdAt: 7,
    });
    await database.tombstones.bulkPut([
      { key: "notes:seed-note-9", table: "notes", ref: "seed-note-9", deletedAt: 8 },
      {
        key: "note_tags:seed-note-0|seed-tag-alpha",
        table: "note_tags",
        ref: "seed-note-0|seed-tag-alpha",
        deletedAt: 9,
      },
    ]);
    await database.settings.put({ key: "lastNotebookId", value: "seed-notebook-work" });

    const result = await remapNonUuidIds(database);
    // 2 notebooks + 1 note + 1 tag + 1 attachment remapped; the `seed-note-9`
    // tombstone dropped below is the one sanitization.
    expect(result).toEqual({ remapped: 5, sanitized: 1 });

    const notebooks = await database.notebooks.toArray();
    expect(notebooks.every((row) => isUuid(row.id))).toBe(true);
    const work = notebooks.find((row) => row.name === "Work");
    const engineering = notebooks.find((row) => row.name === "Engineering");
    if (!work || !engineering) throw new Error("notebooks missing after remap");
    expect(engineering.parentId).toBe(work.id);

    const note = (await database.notes.toArray())[0];
    expect(isUuid(note.id)).toBe(true);
    expect(note.notebookId).toBe(engineering.id);
    expect(await database.notes.get("seed-note-0")).toBeUndefined();

    const tag = (await database.tags.toArray())[0];
    expect(isUuid(tag.id)).toBe(true);

    const link = (await database.noteTags.toArray())[0];
    expect(link.noteId).toBe(note.id);
    expect(link.tagId).toBe(tag.id);

    const attachment = (await database.attachments.toArray())[0];
    expect(isUuid(attachment.id)).toBe(true);
    expect(attachment.noteId).toBe(note.id);

    expect((await database.versions.toArray())[0].noteId).toBe(note.id);
    expect((await database.noteLinks.toArray())[0].sourceId).toBe(note.id);

    const tombstones = await database.tombstones.toArray();
    // The `seed-note-9` tombstone is dropped: the note is gone locally, the id
    // can never become a uuid, and it was never on the server.
    expect(tombstones).toHaveLength(1);
    const tagTombstone = tombstones[0];
    expect(tagTombstone.table).toBe("note_tags");
    expect(tagTombstone.ref).toBe(`${note.id}|${tag.id}`);

    const setting = await database.settings.get("lastNotebookId");
    expect(setting?.value).toBe(work.id);

    // Idempotent: a second pass finds nothing to do.
    expect(await remapNonUuidIds(database)).toEqual({ remapped: 0, sanitized: 0 });
  });

  it("leaves UUID-only data untouched", async () => {
    const database = db();
    const id = crypto.randomUUID();
    await database.tags.put({ id, name: "fine", color: "slate", createdAt: 1 });

    expect(await remapNonUuidIds(database)).toEqual({ remapped: 0, sanitized: 0 });
    expect((await database.tags.get(id))?.name).toBe("fine");
  });

  it("clears dangling references and drops orphans that can never be UUIDs", async () => {
    const database = db();

    await database.notebooks.put({
      id: crypto.randomUUID(),
      parentId: "seed-notebook-gone",
      name: "Root again",
      position: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    await database.notes.put({
      id: crypto.randomUUID(),
      notebookId: "seed-notebook-gone",
      title: "Unfiled again",
      contentJson: { type: "doc" },
      contentMarkdown: "",
      contentText: "",
      isPinned: 0,
      isTrashed: 0,
      trashedAt: null,
      version: 1,
      createdAt: 2,
      updatedAt: 2,
    });
    await database.attachments.put({
      id: "seed-attachment-orphan",
      noteId: "seed-note-gone",
      fileName: "gone.svg",
      mime: "image/svg+xml",
      size: 1,
      width: null,
      height: null,
      data: new Uint8Array([1]),
      createdAt: 3,
    });
    await database.noteTags.put({
      id: "link-orphan",
      noteId: "seed-note-gone",
      tagId: crypto.randomUUID(),
    });
    await database.settings.put({ key: "lastNotebookId", value: "seed-notebook-gone" });

    const result = await remapNonUuidIds(database);
    // Only the attachment's own id is remappable; its note is gone, so the
    // row is dropped. Parent, note reference, link, and setting are cleared.
    expect(result).toEqual({ remapped: 1, sanitized: 5 });

    const notebooks = await database.notebooks.toArray();
    expect(notebooks[0].parentId).toBe("");
    const notes = await database.notes.toArray();
    expect(notes[0].notebookId).toBe("");
    expect(await database.attachments.count()).toBe(0);
    expect(await database.noteTags.count()).toBe(0);
    expect((await database.settings.get("lastNotebookId"))?.value).toBe("");

    // And a second pass is a no-op.
    expect(await remapNonUuidIds(database)).toEqual({ remapped: 0, sanitized: 0 });
  });
});
