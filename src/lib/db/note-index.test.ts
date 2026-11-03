import { describe, expect, it } from "vitest";
import { withTestDb } from "./test-helpers";
import { db } from "./db";
import { createNote, trashNotes } from "./repositories/notes";
import { createNotebook, noteCountsByNotebook } from "./repositories/notebooks";
import {
  listNoteTitleIndex,
  listRecentNotes,
  liveNoteIds,
} from "./repositories/note-index";

withTestDb();

describe("listNoteTitleIndex", () => {
  it("returns titles and ids without loading bodies", async () => {
    const note = await createNote({ title: "Roof", contentText: "tiles" });
    const index = await listNoteTitleIndex();

    expect(index).toContainEqual({ id: note.id, title: "Roof" });
  });

  it("leaves trashed notes out", async () => {
    const live = await createNote({ title: "Live" });
    const gone = await createNote({ title: "Gone" });
    await trashNotes([gone.id]);

    const index = await listNoteTitleIndex();
    expect(index.map((row) => row.id)).toEqual([live.id]);
  });
});

describe("listRecentNotes", () => {
  it("returns the newest live notes, limited, newest first", async () => {
    const first = await createNote({ title: "First" });
    const second = await createNote({ title: "Second" });
    const third = await createNote({ title: "Third" });

    // Timestamps have millisecond resolution; write an unambiguous order
    // rather than sleeping and hoping.
    await db().notes.update(first.id, { updatedAt: 1 });
    await db().notes.update(second.id, { updatedAt: 2 });
    await db().notes.update(third.id, { updatedAt: 3 });

    const recent = await listRecentNotes(2);
    expect(recent.map((note) => note.title)).toEqual(["Third", "Second"]);
  });

  it("skips trashed notes", async () => {
    await createNote({ title: "Keep" });
    const gone = await createNote({ title: "Gone" });
    await trashNotes([gone.id]);

    const recent = await listRecentNotes(10);
    expect(recent.map((note) => note.title)).toEqual(["Keep"]);
  });

  it("returns nothing for a zero limit", async () => {
    await createNote({ title: "A" });
    expect(await listRecentNotes(0)).toEqual([]);
  });
});

describe("liveNoteIds", () => {
  it("returns primary keys only", async () => {
    const note = await createNote({ title: "A" });
    expect(await liveNoteIds()).toEqual([note.id]);
  });
});

describe("noteCountsByNotebook", () => {
  it("counts live notes through the compound index", async () => {
    const work = await createNotebook({ name: "Work" });
    await createNote({ notebookId: work.id });
    await createNote({ notebookId: work.id });
    const trashed = await createNote({ notebookId: work.id });
    await trashNotes([trashed.id]);

    const counts = await noteCountsByNotebook();
    expect(counts.get(work.id)).toBe(2);
  });
});
