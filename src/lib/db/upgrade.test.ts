import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { NotesDatabase } from "./db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The v4 schema, copied verbatim from `db.ts`. This test exists because the
 * shipped upgrade wiring is the one path where a mistake means every existing
 * database fails to open — and the unit tests for `remapNonUuidIds` call its
 * body directly, so they cannot catch a mis-numbered version or a dropped
 * `.upgrade()` callback.
 */
const V4_STORES = {
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
};

const names: string[] = [];

afterEach(async () => {
  for (const name of names) await Dexie.delete(name);
  names.length = 0;
});

describe("NotesDatabase upgrade", () => {
  it("repairs readable ids when opening a v4 database", async () => {
    const name = `sidenote-upgrade-${crypto.randomUUID()}`;
    names.push(name);

    const legacy = new Dexie(name);
    legacy.version(4).stores(V4_STORES);
    await legacy.open();

    await legacy.table("notebooks").add({
      id: "seed-notebook-1",
      parentId: "",
      name: "Samples",
      position: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    await legacy.table("notes").add({
      id: "seed-note-1",
      notebookId: "seed-notebook-1",
      title: "A sample",
      contentJson: { type: "doc", content: [{ type: "paragraph" }] },
      contentMarkdown: "",
      contentText: "",
      isPinned: 0,
      isTrashed: 0,
      trashedAt: null,
      version: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    legacy.close();

    const upgraded = new NotesDatabase(name);
    await upgraded.open();

    expect(upgraded.verno).toBe(6);

    const notes = await upgraded.notes.toArray();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toMatch(UUID);
    expect(notes[0].notebookId).toMatch(UUID);

    const notebooks = await upgraded.notebooks.toArray();
    expect(notebooks[0].id).toMatch(UUID);
    expect(notebooks[0].id).toBe(notes[0].notebookId);

    // The v6 title projection is built by the upgrade, not by a data rewrite.
    const titles = await upgraded.notes
      .where("[isTrashed+title+id]")
      .between([0, Dexie.minKey], [0, Dexie.maxKey])
      .keys();
    expect(titles).toHaveLength(1);
    expect((titles[0] as unknown as [number, string, string])[1]).toBe("A sample");

    upgraded.close();
  });
});
