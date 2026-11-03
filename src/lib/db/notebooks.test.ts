import { describe, expect, it } from "vitest";
import { withTestDb } from "./test-helpers";
import {
  createNotebook,
  deleteNotebook,
  listNotebooks,
  moveNotebook,
  noteCountsByNotebook,
  renameNotebook,
  reorderNotebooks,
  NotebookCycleError,
  NotebookMissingError,
} from "./repositories/notebooks";
import { createNote, listNotes, listTrashedNotes, countTrashedNotes } from "./repositories/notes";
import { buildNotebookTree } from "./tree";
import { db } from "./db";

withTestDb();

/**
 * Always assert against freshly read rows, never the objects returned by a
 * mutating call — those are snapshots and go stale the moment a write lands.
 */
async function treeOf() {
  return buildNotebookTree(await listNotebooks());
}

describe("createNotebook", () => {
  it("creates a root notebook at the end of the sibling order", async () => {
    const a = await createNotebook({ name: "Alpha" });
    const b = await createNotebook({ name: "Beta" });

    expect(a.parentId).toBeNull();
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  it("rejects a blank name", async () => {
    await expect(createNotebook({ name: "   " })).rejects.toThrow(/cannot be empty/i);
  });

  it("rejects a parent that does not exist", async () => {
    await expect(createNotebook({ name: "Orphan", parentId: "nope" })).rejects.toThrow(
      NotebookMissingError,
    );
  });

  it("nests under an existing parent", async () => {
    const parent = await createNotebook({ name: "Parent" });
    const child = await createNotebook({ name: "Child", parentId: parent.id });

    expect(child.parentId).toBe(parent.id);

    const tree = buildNotebookTree([parent, child]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.name)).toEqual(["Child"]);
  });
});

describe("moveNotebook", () => {
  it("re-parents a notebook", async () => {
    const a = await createNotebook({ name: "A" });
    const b = await createNotebook({ name: "B" });

    await moveNotebook(b.id, a.id);

    const tree = await treeOf();
    expect(tree[0].name).toBe("A");
    expect(tree[0].children.map((c) => c.name)).toEqual(["B"]);
  });

  it("refuses to move a notebook inside its own descendant", async () => {
    const work = await createNotebook({ name: "Work" });
    const eng = await createNotebook({ name: "Engineering", parentId: work.id });
    const backend = await createNotebook({ name: "Backend", parentId: eng.id });

    await expect(moveNotebook(work.id, backend.id)).rejects.toThrow(NotebookCycleError);
    // Nothing moved.
    const tree = await treeOf();
    expect(tree[0].name).toBe("Work");
  });

  it("refuses to make a notebook its own parent", async () => {
    const a = await createNotebook({ name: "A" });
    await expect(moveNotebook(a.id, a.id)).rejects.toThrow(NotebookCycleError);
  });

  it("stamps every sibling whose position changed, so the order syncs", async () => {
    const a = await createNotebook({ name: "A" });
    await createNotebook({ name: "B" });
    await createNotebook({ name: "C" });

    // Backdate every row so a fresh stamp is observable without depending on
    // millisecond clock resolution.
    await db().notebooks.toCollection().modify({ updatedAt: 1 });

    await moveNotebook(a.id, null, 2);

    const rows = await db().notebooks.toArray();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.updatedAt > 1)).toBe(true);
    expect([...rows].sort((x, y) => x.position - y.position).map((row) => row.name)).toEqual([
      "B",
      "C",
      "A",
    ]);
  });

  it("moves to the root", async () => {
    const work = await createNotebook({ name: "Work" });
    const eng = await createNotebook({ name: "Engineering", parentId: work.id });

    await moveNotebook(eng.id, null);

    const tree = await treeOf();
    expect(tree.map((n) => n.name).sort()).toEqual(["Engineering", "Work"]);
  });
});

describe("reorderNotebooks", () => {
  it("persists an explicit sibling order", async () => {
    const a = await createNotebook({ name: "A" });
    const b = await createNotebook({ name: "B" });
    const c = await createNotebook({ name: "C" });

    await reorderNotebooks(null, [c.id, a.id, b.id]);

    const tree = await treeOf();
    expect(tree.map((n) => n.name)).toEqual(["C", "A", "B"]);
  });
});

describe("deleteNotebook", () => {
  it("trashes notes in the whole subtree by default", async () => {
    const work = await createNotebook({ name: "Work" });
    const eng = await createNotebook({ name: "Eng", parentId: work.id });

    await createNote({ notebookId: work.id, title: "top" });
    await createNote({ notebookId: eng.id, title: "nested" });

    await deleteNotebook(work.id);

    expect(await listNotes()).toHaveLength(0);
    expect(await countTrashedNotes()).toBe(2);
    expect(await treeOf()).toHaveLength(0);
  });

  it("unfiles notes instead of trashing when asked", async () => {
    const work = await createNotebook({ name: "Work" });
    const note = await createNote({ notebookId: work.id, title: "keep me" });

    await deleteNotebook(work.id, "unfileNotes");

    const notes = await listNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(note.id);
    expect(notes[0].notebookId).toBeNull();
    expect(await countTrashedNotes()).toBe(0);
  });

  it("purges notes when asked", async () => {
    const work = await createNotebook({ name: "Work" });
    const note = await createNote({ notebookId: work.id, title: "gone" });

    await deleteNotebook(work.id, "purgeNotes");

    expect(await listNotes({ includeTrashed: true })).toHaveLength(0);
    expect(await listTrashedNotes()).toHaveLength(0);
    expect(note.id).toBeTruthy();
  });

  it("leaves sibling notebooks and their notes untouched", async () => {
    const work = await createNotebook({ name: "Work" });
    const personal = await createNotebook({ name: "Personal" });
    await createNote({ notebookId: work.id, title: "a" });
    const survivor = await createNote({ notebookId: personal.id, title: "b" });

    await deleteNotebook(work.id);

    const notes = await listNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(survivor.id);
  });

  it("reindexes sibling positions after a delete", async () => {
    await createNotebook({ name: "A" });
    const b = await createNotebook({ name: "B" });
    await createNotebook({ name: "C" });

    await deleteNotebook(b.id);

    const tree = await treeOf();
    expect(tree.map((n) => n.name)).toEqual(["A", "C"]);
    expect(tree.map((n) => n.position)).toEqual([0, 1]);
  });
});

describe("noteCountsByNotebook", () => {
  it("counts only live notes", async () => {
    const work = await createNotebook({ name: "Work" });
    const note = await createNote({ notebookId: work.id, title: "one" });
    await createNote({ notebookId: null, title: "unfiled" });

    let counts = await noteCountsByNotebook();
    expect(counts.get(work.id)).toBe(1);

    await deleteNotebook(work.id, "trashNotes");
    counts = await noteCountsByNotebook();
    expect(counts.get(work.id)).toBeUndefined();
    expect(note.id).toBeTruthy();
  });
});

describe("renameNotebook", () => {
  it("trims and updates the name", async () => {
    const a = await createNotebook({ name: "Old" });
    await renameNotebook(a.id, "  New name  ");
    const [updated] = await listNotebooks();
    expect(updated.name).toBe("New name");
  });

  it("throws for a missing notebook", async () => {
    await expect(renameNotebook("nope", "x")).rejects.toThrow(NotebookMissingError);
  });
});
