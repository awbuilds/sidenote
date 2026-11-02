import { describe, expect, it } from "vitest";
import { withTestDb } from "./test-helpers";
import { addAttachment, bytesToBlob, listAllAttachments } from "./repositories/attachments";
import { createNote, renameNote, trashNotes } from "./repositories/notes";
import { db } from "./db";

withTestDb();

function image(noteId: string, name: string) {
  return addAttachment({
    noteId,
    fileName: name,
    mime: "image/webp",
    blob: bytesToBlob(new Uint8Array(1024), "image/webp"),
    width: 800,
    height: 600,
  });
}

describe("listAllAttachments", () => {
  it("is empty for a workspace with no attachments", async () => {
    await createNote({ title: "A note" });
    expect(await listAllAttachments()).toEqual([]);
  });

  it("lists every attachment with its note's title", async () => {
    const note = await createNote({ title: "Holiday" });
    await image(note.id, "beach.webp");
    await image(note.id, "mountain.webp");

    const all = await listAllAttachments();
    expect(all.map((a) => a.fileName).sort()).toEqual(["beach.webp", "mountain.webp"]);
    expect(all.every((a) => a.noteTitle === "Holiday")).toBe(true);
  });

  it("most recently added first", async () => {
    // Timestamps are written directly rather than by stepping the clock:
    // `createdAt` has millisecond resolution, so two images added in the same
    // tick tie and the assertion would be a coin flip. Fake timers are not an
    // option here — freezing the clock also stalls Dexie's own scheduling and
    // the hooks time out.
    const note = await createNote({ title: "Holiday" });
    const older = await image(note.id, "older.webp");
    const newer = await image(note.id, "newer.webp");
    await db().attachments.update(older.id, { createdAt: 1_000 });
    await db().attachments.update(newer.id, { createdAt: 2_000 });

    expect((await listAllAttachments()).map((a) => a.fileName)).toEqual([
      "newer.webp",
      "older.webp",
    ]);
  });

  it("orders same-timestamp attachments stably rather than at random", async () => {
    const note = await createNote({ title: "Holiday" });
    // No clock stepping: these genuinely land in the same millisecond.
    await image(note.id, "a.webp");
    await image(note.id, "b.webp");

    const first = (await listAllAttachments()).map((a) => a.id);
    const second = (await listAllAttachments()).map((a) => a.id);
    // Tied rows must not swap between reads, or the list reshuffles on every
    // render and reads as broken.
    expect(first).toEqual(second);
  });

  it("follows a rename, so the label is never stale", async () => {
    const note = await createNote({ title: "Before" });
    await image(note.id, "a.webp");
    expect((await listAllAttachments())[0]?.noteTitle).toBe("Before");

    await renameNote(note.id, "After");
    expect((await listAllAttachments())[0]?.noteTitle).toBe("After");
  });

  it("excludes attachments belonging to a trashed note", async () => {
    const keep = await createNote({ title: "Keep" });
    const drop = await createNote({ title: "Drop" });
    await image(keep.id, "kept.webp");
    await image(drop.id, "trashed.webp");

    await trashNotes([drop.id]);

    const all = await listAllAttachments();
    expect(all.map((a) => a.fileName)).toEqual(["kept.webp"]);
  });

  it("labels an untitled note honestly rather than blank", async () => {
    const note = await createNote({ title: "   " });
    await image(note.id, "orphan.webp");
    expect((await listAllAttachments())[0]?.noteTitle).toBe("Untitled");
  });

  it("keeps the bytes out of the listing", async () => {
    // The browser view only needs metadata; pulling every image into memory to
    // draw a list would be the single largest allocation in the app.
    const note = await createNote({ title: "Holiday" });
    await image(note.id, "big.webp");
    expect(await db().attachments.count()).toBe(1);
    expect(Object.keys((await listAllAttachments())[0] ?? {})).not.toContain("data");
  });
});
