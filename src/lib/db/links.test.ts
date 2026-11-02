import { describe, expect, it, vi } from "vitest";
import { withTestDb } from "./test-helpers";
import {
  backlinksFor,
  linkCounts,
  outgoingLinks,
  rebuildLinksForNote,
  resolvePendingLinks,
} from "./repositories/links";
import {
  createNote,
  purgeNotes,
  renameNote,
  saveNoteContent,
  trashNotes,
} from "./repositories/notes";
import { fromMarkdown } from "@/lib/tiptap/markdown";

withTestDb();

async function noteWith(title: string, body: string) {
  const note = await createNote({ title, contentJson: fromMarkdown(body) });
  await saveNoteContent(note.id, {
    title,
    contentJson: fromMarkdown(body),
    contentMarkdown: body,
    contentText: body,
  });
  return note;
}

describe("rebuildLinksForNote", () => {
  it("stores a link to an existing note, resolved", async () => {
    const roof = await noteWith("Roof", "tiles");
    const wall = await noteWith("Wall", "bricks");
    await rebuildLinksForNote(wall.id, "see [[Roof]] above");

    const links = await outgoingLinks(wall.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.targetId).toBe(roof.id);
    expect(links[0]?.targetTitle).toBe("Roof");
  });

  it("keeps an unresolved link so it can resolve later", async () => {
    const wall = await noteWith("Wall", "bricks");
    await rebuildLinksForNote(wall.id, "see [[Roof]] above");

    const links = await outgoingLinks(wall.id);
    expect(links[0]?.targetId).toBeNull();
  });

  it("matches titles case-insensitively", async () => {
    const roof = await noteWith("Roof", "tiles");
    const wall = await noteWith("Wall", "bricks");
    await rebuildLinksForNote(wall.id, "see [[ROOF]]");

    expect((await outgoingLinks(wall.id))[0]?.targetId).toBe(roof.id);
  });

  it("replaces previous links rather than accumulating", async () => {
    const wall = await noteWith("Wall", "bricks");
    await noteWith("Roof", "tiles");
    await noteWith("Floor", "boards");

    await rebuildLinksForNote(wall.id, "[[Roof]] and [[Floor]]");
    expect(await outgoingLinks(wall.id)).toHaveLength(2);

    await rebuildLinksForNote(wall.id, "[[Roof]] only");
    const links = await outgoingLinks(wall.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.targetTitle).toBe("Roof");
  });

  it("clears links when the body loses them all", async () => {
    const wall = await noteWith("Wall", "bricks");
    await noteWith("Roof", "tiles");

    await rebuildLinksForNote(wall.id, "[[Roof]]");
    expect(await outgoingLinks(wall.id)).toHaveLength(1);

    await rebuildLinksForNote(wall.id, "no links now");
    expect(await outgoingLinks(wall.id)).toHaveLength(0);
  });

  it("deduplicates a title linked twice", async () => {
    const wall = await noteWith("Wall", "bricks");
    await rebuildLinksForNote(wall.id, "[[Roof]] then [[Roof]] then [[roof]]");
    expect(await outgoingLinks(wall.id)).toHaveLength(1);
  });

  it("ignores a trashed target when resolving", async () => {
    const roof = await noteWith("Roof", "tiles");
    const wall = await noteWith("Wall", "bricks");
    await trashNotes([roof.id]);

    await rebuildLinksForNote(wall.id, "[[Roof]]");
    expect((await outgoingLinks(wall.id))[0]?.targetId).toBeNull();
  });
});

describe("backlinksFor", () => {
  it("finds the note that links here", async () => {
    const roof = await noteWith("Roof", "tiles");
    const wall = await noteWith("Wall", "see [[Roof]]");
    await rebuildLinksForNote(roof.id, "tiles");
    await rebuildLinksForNote(wall.id, "see [[Roof]]");

    const back = await backlinksFor(roof.id);
    expect(back.map((n) => n.id)).toEqual([wall.id]);
  });

  it("is empty when nothing links here", async () => {
    const roof = await noteWith("Roof", "tiles");
    await rebuildLinksForNote(roof.id, "tiles");
    expect(await backlinksFor(roof.id)).toEqual([]);
  });

  it("excludes a trashed source note", async () => {
    const roof = await noteWith("Roof", "tiles");
    const wall = await noteWith("Wall", "see [[Roof]]");
    await rebuildLinksForNote(roof.id, "tiles");
    await rebuildLinksForNote(wall.id, "see [[Roof]]");

    await trashNotes([wall.id]);

    expect(await backlinksFor(roof.id)).toEqual([]);
  });

  it("does not treat a self-link as a backlink", async () => {
    const roof = await noteWith("Roof", "see [[Roof]]");
    await rebuildLinksForNote(roof.id, "see [[Roof]]");
    expect(await backlinksFor(roof.id)).toEqual([]);
  });

  it("lists multiple sources most-recent first", async () => {
    const roof = await noteWith("Roof", "tiles");
    const a = await noteWith("A", "[[Roof]]");
    await rebuildLinksForNote(roof.id, "tiles");
    await rebuildLinksForNote(a.id, "[[Roof]]");

    const b = await noteWith("B", "[[Roof]]");
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000);
    await rebuildLinksForNote(b.id, "[[Roof]]");
    vi.restoreAllMocks();

    const back = await backlinksFor(roof.id);
    expect(back.map((n) => n.id)).toEqual([b.id, a.id]);
  });
});

describe("resolvePendingLinks", () => {
  it("resolves a pending link as soon as the target note is saved", async () => {
    const wall = await noteWith("Wall", "see [[Roof]]");
    expect((await outgoingLinks(wall.id))[0]?.targetId).toBeNull();

    // Saving a note resolves pending links on its behalf, so the author never
    // has to go back and re-save the note that wrote the link.
    const roof = await noteWith("Roof", "tiles");

    const link = (await outgoingLinks(wall.id))[0];
    expect(link?.targetTitle).toBe("Roof");
    // And the backlink is live without anyone re-saving the wall.
    expect((await backlinksFor(roof.id)).map((n) => n.id)).toEqual([wall.id]);
  });

  it("resolves nothing when there is nothing pending", async () => {
    const wall = await noteWith("Wall", "bricks");
    expect(await resolvePendingLinks()).toBe(0);
    expect(await outgoingLinks(wall.id)).toHaveLength(0);
  });

  it("does not make a note its own backlink", async () => {
    const roof = await noteWith("Roof", "see [[Roof]]");
    await resolvePendingLinks();
    expect(await backlinksFor(roof.id)).toEqual([]);
  });

  it("leaves a pending link pending when the title never appears", async () => {
    const wall = await noteWith("Wall", "see [[Never]]");
    expect(await resolvePendingLinks()).toBe(0);
    expect((await outgoingLinks(wall.id))[0]?.targetId).toBeNull();
  });
});

describe("linkCounts", () => {
  it("counts both directions", async () => {
    const roof = await noteWith("Roof", "tiles");
    const wall = await noteWith("Wall", "[[Roof]]");
    await rebuildLinksForNote(roof.id, "tiles");
    await rebuildLinksForNote(wall.id, "[[Roof]]");

    const counts = await linkCounts([roof.id, wall.id]);
    expect(counts.get(roof.id)).toEqual({ outgoing: 0, incoming: 1 });
    expect(counts.get(wall.id)).toEqual({ outgoing: 1, incoming: 0 });
  });

  it("omits notes with no links rather than zeroing them", async () => {
    const roof = await noteWith("Roof", "tiles");
    const counts = await linkCounts([roof.id]);
    expect(counts.has(roof.id)).toBe(false);
  });

  it("does not count an unresolved link as incoming anywhere", async () => {
    const wall = await noteWith("Wall", "[[Ghost]]");
    await rebuildLinksForNote(wall.id, "[[Ghost]]");

    const counts = await linkCounts([wall.id]);
    expect(counts.get(wall.id)).toEqual({ outgoing: 1, incoming: 0 });
  });

  it("handles an empty batch without querying", async () => {
    expect((await linkCounts([])).size).toBe(0);
  });
});

describe("purging a note", () => {
  it("removes its outgoing links and stops it being a backlink target", async () => {
    const roof = await noteWith("Roof", "tiles");
    const wall = await noteWith("Wall", "[[Roof]]");
    await rebuildLinksForNote(roof.id, "tiles");
    await rebuildLinksForNote(wall.id, "[[Roof]]");

    await purgeNotes([roof.id]);

    expect(await outgoingLinks(wall.id)).toHaveLength(0);
    expect(await backlinksFor(roof.id)).toHaveLength(0);
  });
});

describe("renames", () => {
  it("moves a backlink when the target is renamed and the source re-saved", async () => {
    const roof = await noteWith("Roof", "tiles");
    const wall = await noteWith("Wall", "[[Roof]]");
    await rebuildLinksForNote(wall.id, "[[Roof]]");
    expect((await backlinksFor(roof.id)).map((n) => n.id)).toEqual([wall.id]);

    await renameNote(roof.id, "Roofing");
    // The source body still says [[Roof]], so re-saving it re-resolves.
    await rebuildLinksForNote(wall.id, "[[Roofing]]");
    await resolvePendingLinks();

    expect((await backlinksFor(roof.id)).map((n) => n.id)).toEqual([wall.id]);
  });
});
