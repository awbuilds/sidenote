import { describe, expect, it } from "vitest";
import { withTestDb } from "./test-helpers";
import { createNote } from "./repositories/notes";
import {
  allTagsInUse,
  createTag,
  deleteTag,
  listTags,
  noteIdsForTag,
  normalizeTagName,
  pruneUnusedTags,
  removeTagFromNote,
  renameTag,
  setNoteTags,
  tagsForNote,
} from "./repositories/tags";

withTestDb();

describe("createTag", () => {
  it("lowercases and trims the name", async () => {
    const tag = await createTag("  Reading  ");
    expect(tag.name).toBe("reading");
  });

  it("returns the existing tag rather than creating a duplicate", async () => {
    const a = await createTag("Work");
    const b = await createTag("work");
    expect(b.id).toBe(a.id);
    expect(await listTags()).toHaveLength(1);
  });

  it("rejects a blank name", async () => {
    await expect(createTag("   ")).rejects.toThrow(/cannot be empty/i);
  });
});

describe("normalizeTagName", () => {
  it("is the dedup key", () => {
    expect(normalizeTagName("  MiXeD Case  ")).toBe("mixed case");
  });
});

describe("renameTag", () => {
  it("renames without colliding", async () => {
    const a = await createTag("old");
    await renameTag(a.id, "New");
    const [tag] = await listTags();
    expect(tag.name).toBe("new");
  });

  it("refuses a name already in use", async () => {
    await createTag("taken");
    const other = await createTag("other");
    await expect(renameTag(other.id, "taken")).rejects.toThrow(/already exists/i);
  });
});

describe("setNoteTags", () => {
  it("attaches, replacing whatever was there", async () => {
    const note = await createNote({});
    await setNoteTags(note.id, ["alpha", "beta"]);
    expect((await tagsForNote(note.id)).map((t) => t.name)).toEqual(["alpha", "beta"]);

    await setNoteTags(note.id, ["gamma"]);
    expect((await tagsForNote(note.id)).map((t) => t.name)).toEqual(["gamma"]);
  });

  it("deduplicates case-insensitively within one call", async () => {
    const note = await createNote({});
    await setNoteTags(note.id, ["Work", "work", "WORK"]);
    expect(await tagsForNote(note.id)).toHaveLength(1);
  });

  it("shares one tag row across notes", async () => {
    const a = await createNote({});
    const b = await createNote({});
    await setNoteTags(a.id, ["shared"]);
    await setNoteTags(b.id, ["shared"]);

    expect(await listTags()).toHaveLength(1);
    const [tag] = await listTags();
    expect((await noteIdsForTag(tag.id)).sort()).toEqual([a.id, b.id].sort());
  });

  it("removing a tag from one note leaves the other alone", async () => {
    const a = await createNote({});
    const b = await createNote({});
    await setNoteTags(a.id, ["shared"]);
    await setNoteTags(b.id, ["shared"]);
    const [tag] = await listTags();

    await removeTagFromNote(a.id, tag.id);

    expect(await tagsForNote(a.id)).toHaveLength(0);
    expect(await tagsForNote(b.id)).toHaveLength(1);
  });
});

describe("deleteTag", () => {
  it("removes the tag and its links", async () => {
    const note = await createNote({});
    await setNoteTags(note.id, ["doomed"]);
    const [tag] = await listTags();

    await deleteTag(tag.id);

    expect(await listTags()).toHaveLength(0);
    expect(await noteIdsForTag(tag.id)).toHaveLength(0);
  });
});

describe("pruneUnusedTags", () => {
  it("drops orphans but keeps anything still referenced", async () => {
    const note = await createNote({});
    await setNoteTags(note.id, ["kept"]);
    await createTag("orphan");

    const removed = await pruneUnusedTags();

    expect(removed).toBe(1);
    expect((await listTags()).map((t) => t.name)).toEqual(["kept"]);
  });

  it("allTagsInUse excludes unreferenced tags", async () => {
    const note = await createNote({});
    await setNoteTags(note.id, ["used"]);
    await createTag("unused");

    expect((await allTagsInUse()).map((t) => t.name)).toEqual(["used"]);
  });
});
