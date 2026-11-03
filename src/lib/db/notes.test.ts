import { describe, expect, it, vi } from "vitest";
import { withTestDb } from "./test-helpers";
import { createNotebook, deleteNotebook } from "./repositories/notebooks";
import { setSetting } from "./repositories/settings";
import { addAttachment } from "./repositories/attachments";
import {
  countTrashedNotes,
  createNote,
  createVersion,
  emptyTrash,
  getNote,
  listNotes,
  listTrashedNotes,
  listVersions,
  moveNotes,
  purgeNotes,
  restoreNotes,
  restoreVersion,
  saveNoteContent,
  togglePin,
  trashNotes,
  NoteMissingError,
} from "./repositories/notes";
import { db } from "./db";

withTestDb();

function patch(text: string, markdown = text) {
  return {
    contentJson: {
      type: "doc" as const,
      content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }],
    },
    contentMarkdown: markdown,
    contentText: text,
  };
}

describe("createNote", () => {
  it("starts at version 1 with an empty body", async () => {
    const note = await createNote({});
    expect(note.version).toBe(1);
    expect(note.isTrashed).toBe(false);
    expect(note.isPinned).toBe(false);
    expect(note.notebookId).toBeNull();
    expect(note.contentJson.type).toBe("doc");
  });

  it("files into a notebook", async () => {
    const nb = await createNotebook({ name: "Work" });
    const note = await createNote({ notebookId: nb.id });
    expect(note.notebookId).toBe(nb.id);
  });
});

describe("saveNoteContent", () => {
  it("bumps the version and snapshots the previous content", async () => {
    const note = await createNote({ title: "v1" });
    expect(note.version).toBe(1);

    const saved = await saveNoteContent(note.id, { title: "v2", ...patch("second") });
    expect(saved.version).toBe(2);
    expect(saved.title).toBe("v2");
    expect(saved.contentText).toBe("second");

    const versions = await listVersions(note.id);
    expect(versions).toHaveLength(1);
    // The snapshot holds what was there *before* the save.
    expect(versions[0].version).toBe(1);
    expect(versions[0].title).toBe("v1");
  });

  it("keeps the title when the patch omits it", async () => {
    const note = await createNote({ title: "Keep me" });
    const saved = await saveNoteContent(note.id, patch("body only"));
    expect(saved.title).toBe("Keep me");
  });

  it("throws for a missing note", async () => {
    await expect(saveNoteContent("nope", patch("x"))).rejects.toThrow(NoteMissingError);
  });

  it("bumps the data version so the search index knows to rebuild", async () => {
    const before = (await db().settings.get("dataVersion"))?.value as number | undefined;
    const note = await createNote({});
    await saveNoteContent(note.id, patch("changed"));
    const after = (await db().settings.get("dataVersion"))?.value as number;
    expect(after).toBeGreaterThan(before ?? 0);
  });
});

describe("version retention", () => {
  it("caps history at the configured limit", async () => {
    await setSetting("versionLimit", 3);
    const note = await createNote({ title: "start" });

    for (let i = 0; i < 10; i++) {
      await saveNoteContent(note.id, { title: `v${i}`, ...patch(`body ${i}`) });
    }

    const versions = await listVersions(note.id);
    expect(versions).toHaveLength(3);
    // Newest kept.
    expect(versions.map((v) => v.version)).toEqual([10, 9, 8]);
  });

  it("drops versions older than the age limit even when under the count", async () => {
    await setSetting("versionMaxAgeDays", 7);
    const note = await createNote({});
    await saveNoteContent(note.id, patch("recent"));

    // Backdate the only snapshot beyond the cutoff.
    const stale = await listVersions(note.id);
    await db().versions.update(stale[0].id, { createdAt: Date.now() - 30 * 86_400_000 });

    await saveNoteContent(note.id, patch("newer"));

    const versions = await listVersions(note.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(2);
  });
});

describe("restoreVersion", () => {
  it("brings back an earlier snapshot as a new version", async () => {
    const note = await createNote({ title: "original" });
    await saveNoteContent(note.id, { title: "second", ...patch("second body") });
    await saveNoteContent(note.id, { title: "third", ...patch("third body") });

    const versions = await listVersions(note.id);
    const original = versions.find((v) => v.title === "original")!;

    const restored = await restoreVersion(note.id, original.version);

    expect(restored.title).toBe("original");
    expect(restored.contentText).toBe("");
    // Restoring is itself a new version, so nothing is lost.
    expect(restored.version).toBe(4);
  });
});

describe("trash lifecycle", () => {
  it("trashes, hides from the list, and restores to the original notebook", async () => {
    const nb = await createNotebook({ name: "Work" });
    const note = await createNote({ notebookId: nb.id, title: "keep" });

    await trashNotes([note.id]);

    expect(await listNotes()).toHaveLength(0);
    expect(await countTrashedNotes()).toBe(1);

    await restoreNotes([note.id]);

    const [restored] = await listNotes();
    expect(restored.id).toBe(note.id);
    expect(restored.notebookId).toBe(nb.id);
  });

  it("purges permanently along with tags, attachments and history", async () => {
    const note = await createNote({ title: "gone" });
    await saveNoteContent(note.id, patch("body"));
    await addAttachment({
      noteId: note.id,
      fileName: "a.txt",
      mime: "text/plain",
      blob: new Blob(["hello"], { type: "text/plain" }),
    });

    await purgeNotes([note.id]);

    expect(await getNote(note.id)).toBeUndefined();
    expect(await listVersions(note.id)).toHaveLength(0);
    expect(await db().attachments.where("noteId").equals(note.id).count()).toBe(0);
  });

  it("empties the whole trash", async () => {
    await createNote({ title: "a" });
    const b = await createNote({ title: "b" });
    const c = await createNote({ title: "c" });
    await trashNotes([b.id, c.id]);

    await emptyTrash();

    expect(await countTrashedNotes()).toBe(0);
    expect(await listNotes()).toHaveLength(1);
  });

  it("lists trashed notes most recently trashed first", async () => {
    // Date.now() has millisecond resolution; without a stepped clock both
    // trashes land on the same timestamp and the ordering is a coin flip.
    let clock = 1_700_000_000_000;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => ++clock);

    try {
      const a = await createNote({ title: "a" });
      const b = await createNote({ title: "b" });
      await trashNotes([a.id]);
      await trashNotes([b.id]);

      const trashed = await listTrashedNotes();
      expect(trashed.map((n) => n.id)).toEqual([b.id, a.id]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("listNotes", () => {
  it("returns pinned notes before the rest", async () => {
    const plain = await createNote({ title: "plain" });
    const pinned = await createNote({ title: "pinned" });
    await togglePin(pinned.id);

    const notes = await listNotes();
    expect(notes[0].id).toBe(pinned.id);
    expect(notes[1].id).toBe(plain.id);
  });

  it("filters by notebook", async () => {
    const work = await createNotebook({ name: "Work" });
    const personal = await createNotebook({ name: "Personal" });
    await createNote({ notebookId: work.id });
    await createNote({ notebookId: personal.id });
    await createNote({});

    expect(await listNotes({ notebookId: work.id })).toHaveLength(1);
    expect(await listNotes({ notebookId: null })).toHaveLength(1);
    expect(await listNotes()).toHaveLength(3);
  });

  it("honours a limit", async () => {
    for (let i = 0; i < 5; i++) await createNote({ title: `n${i}` });
    expect(await listNotes({ limit: 2 })).toHaveLength(2);
  });

  it("moves notes between notebooks and to unfiled", async () => {
    const work = await createNotebook({ name: "Work" });
    const personal = await createNotebook({ name: "Personal" });
    const note = await createNote({ notebookId: work.id });

    await moveNotes([note.id], personal.id);
    expect((await getNote(note.id))!.notebookId).toBe(personal.id);

    await moveNotes([note.id], null);
    expect((await getNote(note.id))!.notebookId).toBeNull();
  });
});

describe("togglePin", () => {
  it("flips and returns the new state", async () => {
    const note = await createNote({});
    expect(await togglePin(note.id)).toBe(true);
    expect(await togglePin(note.id)).toBe(false);
  });
});

describe("snapshot cadence", () => {
  it("does not snapshot every autosave of an unchanged title", async () => {
    const note = await createNote({ title: "Stable" });

    for (let i = 0; i < 10; i++) {
      await saveNoteContent(note.id, { title: "Stable", ...patch(`body ${i}`) });
    }

    const versions = await listVersions(note.id);
    // Only the state before the first save — the rest of the burst is inside
    // the five-minute interval.
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
  });

  it("snapshots a rename immediately", async () => {
    const note = await createNote({ title: "Old name" });
    await saveNoteContent(note.id, { title: "Old name", ...patch("one") });
    await saveNoteContent(note.id, { title: "New name", ...patch("two") });

    const versions = await listVersions(note.id);
    expect(versions.map((version) => version.title)).toContain("Old name");
  });

  it("survives a version counter moved backwards by a sync pull", async () => {
    const note = await createNote({ title: "start" });
    for (let i = 0; i < 5; i++) {
      await saveNoteContent(note.id, { title: `t${i}`, ...patch(`b${i}`) });
    }

    // What `fromRemoteNote` does when the remote row wins with an older
    // counter: the local note now claims a version the history already holds.
    await db().notes.update(note.id, { version: 2 });

    const saved = await saveNoteContent(note.id, {
      title: "after pull",
      ...patch("after pull"),
    });

    expect(saved.version).toBeGreaterThan(6);
    const numbers = (await listVersions(note.id)).map((version) => version.version);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("keeps a named version past the automatic count cap", async () => {
    await setSetting("versionLimit", 2);
    const note = await createNote({ title: "start" });
    await saveNoteContent(note.id, { title: "one", ...patch("one") });

    const named = await createVersion(note.id, "Before the rewrite");
    expect(named.kind).toBe("manual");
    expect(named.label).toBe("Before the rewrite");

    for (let i = 0; i < 6; i++) {
      await saveNoteContent(note.id, { title: `t${i}`, ...patch(`b${i}`) });
    }

    const versions = await listVersions(note.id);
    expect(versions.some((version) => version.id === named.id)).toBe(true);
    expect(versions.filter((version) => version.kind !== "manual")).toHaveLength(2);
  });

  it("always snapshots the pre-restore state", async () => {
    const note = await createNote({ title: "original" });
    await saveNoteContent(note.id, { title: "second", ...patch("second") });
    await saveNoteContent(note.id, { title: "third", ...patch("third") });

    const original = (await listVersions(note.id)).find(
      (version) => version.title === "original",
    );
    expect(original).toBeDefined();

    const before = await listVersions(note.id);
    await restoreVersion(note.id, original!.version);
    const after = await listVersions(note.id);

    expect(after.length).toBeGreaterThan(before.length);
    expect(after.some((version) => version.title === "third")).toBe(true);
  });
});

describe("restore after a notebook delete", () => {
  it("puts an orphaned note back in Unfiled", async () => {
    const work = await createNotebook({ name: "Work" });
    const note = await createNote({ notebookId: work.id, title: "orphan" });

    await deleteNotebook(work.id);
    // The trash path leaves the reference behind; the notebook is gone.
    expect((await getNote(note.id))!.notebookId).toBe(work.id);

    await restoreNotes([note.id]);

    const restored = await getNote(note.id);
    expect(restored!.notebookId).toBeNull();
    expect((await listNotes({ notebookId: null })).map((row) => row.id)).toContain(note.id);
  });
});
