import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { buildExtensions } from "@/lib/tiptap/extensions";
import { withTestDb } from "../db/test-helpers";
import { db } from "../db/db";
import { createNotebook, listNotebooks } from "../db/repositories/notebooks";
import { createNote, listNotes, listTrashedNotes } from "../db/repositories/notes";
import { getSettings } from "../db/repositories/settings";
import { buildNotebookTree } from "../db/tree";
import { removeSampleData, restoreSampleData, seedIfEmpty, wipeAllData } from "./seed";
import { docToText, doc, h, pt, image } from "./builders";

withTestDb();

describe("builders", () => {
  it("flattens a document to plain text", () => {
    const text = docToText(
      doc(h(1, "Title"), pt("Body text"), image({ src: "x", alt: "alt" })),
    );
    expect(text).toContain("Title");
    expect(text).toContain("Body text");
  });

  it("separates block-level content with newlines", () => {
    expect(docToText(doc(pt("a"), pt("b")))).toBe("a\nb");
  });
});

describe("seedIfEmpty", () => {
  it("populates notebooks, notes, tags and attachments", async () => {
    const result = await seedIfEmpty();

    expect(result).not.toBeNull();
    expect(result!.notes).toBeGreaterThan(0);
    expect(result!.notebooks).toBeGreaterThan(0);

    const notebooks = await listNotebooks();
    const tree = buildNotebookTree(notebooks);
    const names = tree.map((n) => n.name);
    expect(names).toContain("Inbox");
    expect(names).toContain("Work");

    // Nesting survived the round trip through storage.
    const work = tree.find((n) => n.name === "Work")!;
    expect(work.children.map((c) => c.name)).toContain("Engineering");

    const notes = await listNotes();
    expect(notes.some((n) => n.title === "Welcome to your notes")).toBe(true);
    expect(notes.some((n) => n.isPinned)).toBe(true);

    expect(await db().tags.count()).toBeGreaterThan(0);
    expect(await db().noteTags.count()).toBeGreaterThan(0);
    expect(await db().attachments.count()).toBeGreaterThan(0);
  });

  it("records what it created and opens the first-run tour", async () => {
    await seedIfEmpty();
    const settings = await getSettings();
    expect(settings.sampleData?.noteIds.length).toBeGreaterThan(0);
    expect(settings.sampleData?.notebookIds.length).toBeGreaterThan(0);
    expect(settings.onboardingPending).toBe(true);
    expect(settings.onboardingCompletedAt).toBeNull();
  });

  it("links a tag to every note that mentions it, not only the first", async () => {
    await seedIfEmpty();

    // The bug: a global `seenTags` set returned early for a tag already seen,
    // so the link row was skipped along with the tag row. The count assertion
    // above passed anyway, because the *first* note did get links.
    const links = await db().noteTags.toArray();
    const perNote = new Map<string, Set<string>>();
    for (const link of links) {
      const set = perNote.get(link.noteId) ?? new Set<string>();
      set.add(link.tagId);
      perNote.set(link.noteId, set);
    }

    // No note with a tag may be missing any of them.
    for (const [noteId, tagIds] of perNote) {
      expect(tagIds.size, `note ${noteId} lost a tag link`).toBeGreaterThan(0);
    }

    // A tag used by two notes must link to both.
    const shared = new Map<string, string[]>();
    for (const link of links) {
      shared.set(link.tagId, [...(shared.get(link.tagId) ?? []), link.noteId]);
    }
    const reused = [...shared.values()].filter((ids) => ids.length > 1);
    expect(reused.length, "no tag is shared between seeded notes").toBeGreaterThan(0);
  });

  it("creates no duplicate note-tag pair", async () => {
    await seedIfEmpty();
    const links = await db().noteTags.toArray();
    const keys = links.map((link) => `${link.noteId}|${link.tagId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("concurrent callers share one run rather than racing", async () => {
    // React StrictMode runs mount effects twice in development, and a second
    // browser tab bootstraps independently. Both used to read `seeded ===
    // false` and write, and the second write collided with the first on the
    // unique [noteId+tagId] index — the app failed to open at all.
    const [first, second, third] = await Promise.all([
      seedIfEmpty(),
      seedIfEmpty(),
      seedIfEmpty(),
    ]);

    // Every caller gets the same answer. One did the work; none of them seeded
    // a second, competing copy.
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(third).toBe(first);

    const links = await db().noteTags.toArray();
    const keys = links.map((link) => `${link.noteId}|${link.tagId}`);
    expect(new Set(keys).size, "a duplicate note-tag pair was written").toBe(keys.length);
  });

  it("can seed again after everything is wiped", async () => {
    await seedIfEmpty();
    expect(await db().notes.count()).toBeGreaterThan(0);

    // `removeSampleData` keeps the `seeded` flag on purpose — the user chose
    // to delete the samples, not to get them back on the next reload. A full
    // wipe clears settings, and the in-flight guard must have reset by then.
    await removeSampleData();
    expect(await seedIfEmpty()).toBeNull();
    expect(await db().notes.count()).toBe(0);

    await wipeAllData();
    const again = await seedIfEmpty();
    expect(again).not.toBeNull();
    expect(await db().notes.count()).toBeGreaterThan(0);
  });

  it("is idempotent — a second run does not duplicate", async () => {
    await seedIfEmpty();
    const first = await db().notes.count();

    const second = await seedIfEmpty();

    expect(second).toBeNull();
    expect(await db().notes.count()).toBe(first);
  });

  it("marks the database as seeded", async () => {
    await seedIfEmpty();
    expect((await getSettings()).seeded).toBe(true);
  });

  it("seeds into a real Note shape — notebookId resolves, not the empty sentinel", async () => {
    await seedIfEmpty();
    const notes = await listNotes();
    const welcome = notes.find((n) => n.title === "Welcome to your notes")!;
    expect(welcome.notebookId).not.toBeNull();
  });
});

describe("removeSampleData", () => {
  it("empties content but keeps settings", async () => {
    await seedIfEmpty();
    await db().settings.put({ key: "profileName", value: "Abhi" });

    await removeSampleData();

    expect(await db().notes.count()).toBe(0);
    expect(await db().notebooks.count()).toBe(0);
    expect(await db().tags.count()).toBe(0);
    expect(await listTrashedNotes()).toHaveLength(0);
    expect((await getSettings()).profileName).toBe("Abhi");
  });

  it("does not re-seed on the next load — deleting samples is a decision", async () => {
    await seedIfEmpty();
    await removeSampleData();

    // `seeded` stays true, so a reload must not put the samples back.
    expect((await getSettings()).seeded).toBe(true);
    expect(await seedIfEmpty()).toBeNull();
    expect(await db().notes.count()).toBe(0);
  });

  it("keeps notes and notebooks the user created", async () => {
    await seedIfEmpty();
    const notebook = await createNotebook({ name: "My notebook" });
    const note = await createNote({
      notebookId: notebook.id,
      title: "My note",
      contentJson: doc(pt("Do not delete me")),
      contentMarkdown: "Do not delete me",
      contentText: "Do not delete me",
    });

    await removeSampleData();

    expect(await db().notes.get(note.id)).toBeDefined();
    expect(await db().notebooks.get(notebook.id)).toBeDefined();
    expect(await db().notes.count()).toBe(1);
  });

  it("keeps a sample notebook that holds a user note", async () => {
    await seedIfEmpty();
    const inbox = (await listNotebooks()).find((item) => item.name === "Inbox")!;
    const note = await createNote({
      notebookId: inbox.id,
      title: "Kept",
      contentJson: doc(pt("mine")),
      contentMarkdown: "mine",
      contentText: "mine",
    });

    await removeSampleData();

    expect(await db().notebooks.get(inbox.id)).toBeDefined();
    expect(await db().notes.get(note.id)).toBeDefined();
  });
});

describe("wipeAllData", () => {
  it("clears every table including settings", async () => {
    await seedIfEmpty();
    await wipeAllData();

    expect(await db().notes.count()).toBe(0);
    expect(await db().notebooks.count()).toBe(0);
    expect(await db().tags.count()).toBe(0);
    expect(await db().noteTags.count()).toBe(0);
    expect(await db().attachments.count()).toBe(0);
    expect(await db().versions.count()).toBe(0);
    expect(await db().settings.count()).toBe(0);
  });
});

describe("seed block coverage", () => {
  it("seeds a table, so the table styling is exercised by real content", async () => {
    await seedIfEmpty();
    const notes = await listNotes();
    const localFirst = notes.find((note) => note.title === "Why local-first")!;

    // The table has to be a real TipTap table node, not Markdown that happens to
    // look like one, or the editor renders it as a paragraph of pipes.
    const walk = (node: { type?: string; content?: unknown[] }): string[] => {
      const found = typeof node.type === "string" ? [node.type] : [];
      for (const child of node.content ?? []) {
        found.push(...walk(child as typeof node));
      }
      return found;
    };
    const types = walk(localFirst.contentJson as never);

    expect(types).toContain("table");
    expect(types).toContain("tableRow");
    expect(types).toContain("tableHeader");
    expect(types).toContain("tableCell");
  });

  it("seeds a blockquote, which renders as a callout", async () => {
    await seedIfEmpty();
    const notes = await listNotes();
    const welcome = notes.find((note) => note.title === "Welcome to your notes")!;
    expect(JSON.stringify(welcome.contentJson)).toContain("blockquote");
  });

  it("keeps the seeded Markdown and the document in step", async () => {
    // The seed supplies both. If they drift, a re-import from Markdown would
    // produce a different note than the one that was seeded.
    await seedIfEmpty();
    const notes = await listNotes();
    const localFirst = notes.find((note) => note.title === "Why local-first")!;

    expect(localFirst.contentMarkdown).toContain("| Where notes live |");
    expect(localFirst.contentText).toContain("Where notes live");
  });
});

describe("seeded documents are valid", () => {
  // Asserting node *types* exist is not enough. A document can have every type
  // it should and still be rejected by the schema — the seeded table once
  // carried empty text nodes, which ProseMirror refuses outright, and the note
  // rendered empty with no error anywhere except a console warning.
  it("every seeded note loads into a real editor", async () => {
    await seedIfEmpty();
    const notes = await listNotes();
    expect(notes.length).toBeGreaterThan(0);

    for (const note of notes) {
      const editor = new Editor({
        extensions: buildExtensions(),
        content: note.contentJson,
        element: document.createElement("div"),
      });
      // getText() forces the document to be materialised; a schema violation
      // surfaces here as a thrown error or an empty document.
      expect(editor.getText().length, `"${note.title}" rendered empty`).toBeGreaterThan(0);
      expect(editor.getJSON().type).toBe("doc");
      editor.destroy();
    }
  });

  it("keeps the seeded table's content", async () => {
    await seedIfEmpty();
    const notes = await listNotes();
    const localFirst = notes.find((note) => note.title === "Why local-first")!;

    const editor = new Editor({
      extensions: buildExtensions(),
      content: localFirst.contentJson,
      element: document.createElement("div"),
    });
    // The blank corner cell is the one that broke it, so the row that follows
    // it is the proof the table survived.
    expect(editor.getText()).toContain("Where notes live");
    expect(editor.getText()).toContain("Without an account");
    editor.destroy();
  });
});

describe("restoreSampleData", () => {
  it("brings the sample content back after it is removed", async () => {
    await seedIfEmpty();
    const before = await listNotes();
    expect(before.length).toBeGreaterThan(0);

    await removeSampleData();
    expect(await listNotes()).toHaveLength(0);

    const result = await restoreSampleData();
    expect(result.notes).toBe(before.length);
    expect((await listNotes()).length).toBe(before.length);
  });

  it("keeps the profile across a reset", async () => {
    await seedIfEmpty();
    await db().settings.put({ key: "profileName", value: "Abhi" });

    await restoreSampleData();

    expect((await getSettings()).profileName).toBe("Abhi");
    expect(await listNotes()).not.toHaveLength(0);
  });

  it("does not duplicate content when reset twice", async () => {
    await seedIfEmpty();
    const first = (await listNotes()).length;

    await restoreSampleData();
    await restoreSampleData();

    expect((await listNotes()).length).toBe(first);
  });
});
