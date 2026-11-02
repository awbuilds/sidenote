import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/lib/db/test-helpers";
import { db } from "@/lib/db/db";
import { isUuid } from "@/lib/uuid";
import { createNotebook, listNotebooks } from "@/lib/db/repositories/notebooks";
import { createNote, listNotes, listTrashedNotes, saveNoteContent } from "@/lib/db/repositories/notes";
import { listTags, setNoteTags } from "@/lib/db/repositories/tags";
import { addAttachment } from "@/lib/db/repositories/attachments";
import { fromMarkdown } from "@/lib/tiptap/markdown";
import { exportAll, parseExportedManifest, defaultArchiveName } from "./zip-export";
import { importFromArchive, ImportError, parseMarkdownNote } from "./zip-import";

/**
 * Backup fidelity.
 *
 * The ZIP is the only copy of this data that exists outside the browser, so a
 * lossy round trip is data loss. These tests restore into a *second, empty*
 * database and compare, rather than asserting on the export's own shape.
 */
withTestDb();

/** Note files only — JSZip also lists the `notes/` directory as an entry. */
function markdownPaths(zip: JSZip): string[] {
  return Object.keys(zip.files).filter(
    (path) => path.startsWith("notes/") && path.endsWith(".md") && !zip.files[path].dir,
  );
}

async function seedLibrary() {
  const work = await createNotebook({ name: "Work" });
  const eng = await createNotebook({ name: "Engineering", parentId: work.id });

  const note = await createNote({ notebookId: eng.id, title: "IndexedDB gotchas" });
  await saveNoteContent(note.id, {
    title: "IndexedDB gotchas",
    contentJson: fromMarkdown("## Keys\n\nBooleans and null are not valid keys."),
    contentMarkdown: "## Keys\n\nBooleans and null are not valid keys.",
    contentText: "Keys\nBooleans and null are not valid keys.",
  });
  await setNoteTags(note.id, ["reference", "code"]);

  const trashed = await createNote({ notebookId: work.id, title: "Scratch" });
  const { trashNotes } = await import("@/lib/db/repositories/notes");
  await trashNotes([trashed.id]);

  const withImage = await createNote({ notebookId: eng.id, title: "Screenshot" });
  await addAttachment({
    noteId: withImage.id,
    fileName: "diagram.png",
    mime: "image/png",
    blob: new Blob([new Uint8Array(256)], { type: "image/png" }),
  });

  return { note, trashed, withImage };
}

describe("exportAll", () => {
  it("produces an archive with both the lossless and the readable layer", async () => {
    await seedLibrary();
    const { blob, manifest } = await exportAll();

    expect(manifest.counts.notes).toBe(3);
    expect(manifest.counts.notebooks).toBe(2);

    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("manifest.json")).not.toBeNull();
    expect(zip.file("data.json")).not.toBeNull();
    // Filter on .md: JSZip lists the `notes/` directory itself as an entry.
    expect(markdownPaths(zip)).toHaveLength(3);
    expect(Object.keys(zip.files).some((p) => p.startsWith("attachments/") && p.endsWith(".png"))).toBe(true);
  });

  it("includes trashed notes — a backup that drops the trash is not a backup", async () => {
    const { trashed } = await seedLibrary();
    const { blob } = await exportAll();

    const zip = await JSZip.loadAsync(blob);
    const data = JSON.parse(await zip.file("data.json")!.async("string"));
    expect(data.notes.some((n: { id: string }) => n.id === trashed.id)).toBe(true);
  });

  it("writes readable Markdown with front matter", async () => {
    await seedLibrary();
    const { blob } = await exportAll();

    const zip = await JSZip.loadAsync(blob);
    // Concatenate rather than picking one: archive entry order is not
    // guaranteed, and every note should be readable.
    const all = (
      await Promise.all(markdownPaths(zip).map((path) => zip.file(path)!.async("string")))
    ).join("\n");

    expect(all).toContain("---");
    expect(all).toContain("notebook: Work");
    expect(all).toContain("notebook: Engineering");
    expect(all).toContain("## Keys");
    expect(all).toContain("IndexedDB");
    // The trashed note is present and marked as such.
    expect(all).toContain("trashed: true");
  });

  it("names the archive with a sortable timestamp", () => {
    expect(defaultArchiveName()).toMatch(/^sidenote-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.zip$/);
  });
});

describe("round trip into a fresh database", () => {
  it("restores notes, notebooks, nesting, tags, trash state and attachments", async () => {
    const seeded = await seedLibrary();
    const { blob, manifest } = await exportAll();

    // Simulate a restore onto empty storage.
    await db().delete();
    const fresh = new (await import("@/lib/db/db")).NotesDatabase(
      `restore-${Date.now()}-${Math.random()}`,
    );
    const { __setDatabase } = await import("@/lib/db/db");
    __setDatabase(fresh);
    await fresh.open();

    const result = await importFromArchive(blob);

    expect(result.mode).toBe("full");
    expect(result.warnings).toEqual([]);
    expect(result.notes).toBe(manifest.counts.notes);
    expect(result.attachments).toBe(manifest.counts.attachments);

    // Notebooks, with nesting intact.
    const notebooks = await listNotebooks();
    const work = notebooks.find((n) => n.name === "Work");
    const eng = notebooks.find((n) => n.name === "Engineering");
    expect(work).toBeDefined();
    expect(eng?.parentId).toBe(work!.id);

    // Content survived as a document, not just text.
    const notes = await listNotes();
    const restored = notes.find((n) => n.title === "IndexedDB gotchas");
    expect(restored).toBeDefined();
    expect(JSON.stringify(restored!.contentJson)).toContain("Keys");

    // Tags and their links.
    expect((await listTags()).map((t) => t.name).sort()).toEqual(["code", "reference"]);

    // Trash state.
    const trashed = await listTrashedNotes();
    expect(trashed.map((n) => n.title)).toEqual(["Scratch"]);

    // Attachments, with their blobs intact.
    const attachments = await fresh.attachments.toArray();
    expect(attachments).toHaveLength(1);
    expect(attachments[0].data.byteLength).toBe(256);

    void seeded;
  });

  it("is idempotent — importing the same archive twice is stable", async () => {
    await seedLibrary();
    const { blob } = await exportAll();

    await importFromArchive(blob);
    const first = (await listNotes()).length;
    await importFromArchive(blob);
    const second = (await listNotes()).length;

    expect(second).toBe(first);
  });

  it("re-keys an archive exported before the UUID migration", async () => {
    await seedLibrary();
    const { blob } = await exportAll();

    // Rewrite data.json into the shape a pre-migration export had: readable
    // ids everywhere, with every reference pointing at them.
    const archive = await JSZip.loadAsync(blob);
    const data = JSON.parse(await archive.file("data.json")!.async("string"));
    const notebookIds = new Map<string, string>(
      data.notebooks.map((n: { id: string }, i: number) => [n.id, `seed-notebook-${i}`]),
    );
    const noteIds = new Map<string, string>(
      data.notes.map((n: { id: string }, i: number) => [n.id, `seed-note-${i}`]),
    );
    const tagIds = new Map<string, string>(
      data.tags.map((t: { id: string }, i: number) => [t.id, `seed-tag-${i}`]),
    );
    data.notebooks = data.notebooks.map((n: { id: string; parentId: string }) => ({
      ...n,
      id: notebookIds.get(n.id),
      parentId: n.parentId === "" ? n.parentId : (notebookIds.get(n.parentId) ?? n.parentId),
    }));
    data.notes = data.notes.map((n: { id: string; notebookId: string }) => ({
      ...n,
      id: noteIds.get(n.id),
      notebookId:
        n.notebookId === "" ? n.notebookId : (notebookIds.get(n.notebookId) ?? n.notebookId),
    }));
    data.tags = data.tags.map((t: { id: string }) => ({ ...t, id: tagIds.get(t.id) }));
    data.noteTags = data.noteTags.map(
      (link: { id: string; noteId: string; tagId: string }, i: number) => ({
        ...link,
        id: `seed-link-${i}`,
        noteId: noteIds.get(link.noteId) ?? link.noteId,
        tagId: tagIds.get(link.tagId) ?? link.tagId,
      }),
    );
    data.attachments = data.attachments.map(
      (a: { id: string; noteId: string }, i: number) => ({
        ...a,
        id: `seed-attachment-${i}`,
        noteId: noteIds.get(a.noteId) ?? a.noteId,
      }),
    );
    archive.file("data.json", JSON.stringify(data));
    const rewritten = await archive.generateAsync({ type: "blob" });

    await db().delete();
    const fresh = new (await import("@/lib/db/db")).NotesDatabase(
      `restore-${Date.now()}-${Math.random()}`,
    );
    const { __setDatabase } = await import("@/lib/db/db");
    __setDatabase(fresh);
    await fresh.open();

    const result = await importFromArchive(rewritten);
    expect(result.notes).toBe(3);

    const freshNotebooks = await fresh.notebooks.toArray();
    const freshNotes = await fresh.notes.toArray();
    const freshTags = await fresh.tags.toArray();
    const freshLinks = await fresh.noteTags.toArray();
    const freshAttachments = await fresh.attachments.toArray();

    expect(freshNotebooks.every((row) => isUuid(row.id))).toBe(true);
    expect(freshNotes.every((row) => isUuid(row.id))).toBe(true);
    expect(freshTags.every((row) => isUuid(row.id))).toBe(true);
    expect(freshAttachments.every((row) => isUuid(row.id) && isUuid(row.noteId))).toBe(true);
    expect(freshLinks.every((row) => isUuid(row.noteId) && isUuid(row.tagId))).toBe(true);

    // References still resolve after the rewrite.
    const work = freshNotebooks.find((n) => n.name === "Work");
    const eng = freshNotebooks.find((n) => n.name === "Engineering");
    expect(eng?.parentId).toBe(work?.id);

    const restored = freshNotes.find((n) => n.title === "IndexedDB gotchas");
    expect(restored?.notebookId).toBe(eng?.id);
    expect(freshLinks.filter((link) => link.noteId === restored?.id)).toHaveLength(2);

    const screenshot = freshNotes.find((n) => n.title === "Screenshot");
    expect(freshAttachments[0]?.noteId).toBe(screenshot?.id);
  });
});

describe("markdown-only archives", () => {
  it("parses front matter and body", () => {
    const parsed = parseMarkdownNote(
      ["---", "id: abc", "notebook: Work", "created: 2026-01-01T00:00:00.000Z", "---", "", "# Title", "", "Body."].join(
        "\n",
      ),
    );

    expect(parsed.title).toBe("Title");
    expect(parsed.frontMatter.id).toBe("abc");
    expect(parsed.frontMatter.notebook).toBe("Work");
    expect(parsed.markdown).toContain("Body.");
  });

  it("falls back to the first heading when there is no title", () => {
    const parsed = parseMarkdownNote("no front matter\n\n## Second heading\n\ntext");
    expect(parsed.title).toBe("Second heading");
  });

  it("handles a quoted front-matter value", () => {
    const parsed = parseMarkdownNote(['---', 'notebook: "Work: research"', "---", "", "x"].join("\n"));
    expect(parsed.frontMatter.notebook).toBe("Work: research");
  });

  it("imports notes and warns that history was not restored", async () => {
    const zip = new JSZip();
    zip.file("notes/one.md", "---\nnotebook: Imported\n---\n\n# First\n\nHello.");
    zip.file("notes/two.md", "# Second\n\nNo front matter.");
    const blob = await zip.generateAsync({ type: "blob" });

    const result = await importFromArchive(blob);

    expect(result.mode).toBe("markdown");
    expect(result.notes).toBe(2);
    expect(result.notebooks).toBe(1);
    expect(result.warnings[0]).toMatch(/no data\.json/i);

    const notes = await listNotes();
    expect(notes.map((n) => n.title).sort()).toEqual(["First", "Second"]);
  });
});

describe("failure modes", () => {
  it("rejects a file that is not a ZIP", async () => {
    await expect(importFromArchive(new Blob(["not a zip"], { type: "text/plain" }))).rejects.toThrow(
      ImportError,
    );
  });

  it("rejects a ZIP with nothing recognisable in it", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "hello");
    const blob = await zip.generateAsync({ type: "blob" });

    await expect(importFromArchive(blob)).rejects.toThrow(/neither data\.json nor/i);
  });

  it("rejects a backup from a different format version", async () => {
    const zip = new JSZip();
    zip.file(
      "data.json",
      JSON.stringify({ manifest: { app: "sidenote", formatVersion: 99 }, notebooks: [], notes: [] }),
    );
    const blob = await zip.generateAsync({ type: "blob" });

    await expect(importFromArchive(blob)).rejects.toThrow(/different version/i);
  });
});

describe("manifest parsing", () => {
  it("reads counts back out of the archive", async () => {
    await seedLibrary();
    const { blob } = await exportAll();
    const manifest = await parseExportedManifest(blob);
    expect(manifest).not.toBeNull();
    expect(manifest!.app).toBe("sidenote");
    expect(manifest!.counts.notes).toBe(3);
  });

  it("returns null for an archive with no manifest", async () => {
    const zip = new JSZip();
    zip.file("notes/a.md", "# hi");
    const blob = await zip.generateAsync({ type: "blob" });
    expect(await parseExportedManifest(blob)).toBeNull();
  });
});
