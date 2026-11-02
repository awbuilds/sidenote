import { db } from "../db";
import type { NoteId, Tag, TagId } from "../types";
import { markTombstone } from "./tombstones";

function now(): number {
  return Date.now();
}

function newId(): string {
  return crypto.randomUUID();
}

/** Tags are always stored lowercased — the name is the dedup key. */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

export async function listTags(): Promise<Tag[]> {
  const tags = await db().tags.toArray();
  return tags.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Create a tag, or return the existing one with that name.
 *
 * Dexie has no unique-constraint analogue of Postgres' `UNIQUE (user_id,
 * lower(name))`, so dedup is enforced here. A race between two concurrent
 * calls is still possible; the re-read after `add` covers it.
 */
export async function createTag(name: string, color = "slate"): Promise<Tag> {
  const normalized = normalizeTagName(name);
  if (normalized === "") throw new Error("Tag name cannot be empty");

  const existing = await db().tags.where("name").equals(normalized).first();
  if (existing) return existing;

  const tag: Tag = { id: newId(), name: normalized, color, createdAt: now() };

  try {
    await db().tags.add(tag);
    return tag;
  } catch {
    const raced = await db().tags.where("name").equals(normalized).first();
    if (raced) return raced;
    throw new Error(`Could not create tag "${normalized}"`);
  }
}

export async function renameTag(id: TagId, name: string): Promise<void> {
  const normalized = normalizeTagName(name);
  if (normalized === "") throw new Error("Tag name cannot be empty");

  const clash = await db().tags.where("name").equals(normalized).first();
  if (clash && clash.id !== id) throw new Error(`Tag "${normalized}" already exists`);

  await db().tags.update(id, { name: normalized });
}

export async function updateTagColor(id: TagId, color: string): Promise<void> {
  await db().tags.update(id, { color });
}

export async function deleteTag(id: TagId): Promise<void> {
  await db().transaction("rw", db().tags, db().noteTags, db().tombstones, async () => {
    await db().noteTags.where("tagId").equals(id).delete();
    await db().tags.delete(id);
    // The join rows cascade server-side; only the tag needs a tombstone.
    await markTombstone("tags", id);
  });
}

/** Tags attached to a set of notes, keyed by note id. */
export async function tagsByNote(noteIds: NoteId[]): Promise<Map<NoteId, Tag[]>> {
  const result = new Map<NoteId, Tag[]>();
  if (noteIds.length === 0) return result;

  const links = await db().noteTags.where("noteId").anyOf(noteIds).toArray();
  if (links.length === 0) return result;

  const tagIds = [...new Set(links.map((link) => link.tagId))];
  const tags = await db().tags.bulkGet(tagIds);
  const byId = new Map<string, Tag>();
  tags.forEach((tag) => {
    if (tag) byId.set(tag.id, tag);
  });

  for (const link of links) {
    const tag = byId.get(link.tagId);
    if (!tag) continue;
    const bucket = result.get(link.noteId);
    if (bucket) bucket.push(tag);
    else result.set(link.noteId, [tag]);
  }

  for (const bucket of result.values()) bucket.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

export async function tagsForNote(noteId: NoteId): Promise<Tag[]> {
  return (await tagsByNote([noteId])).get(noteId) ?? [];
}

/** Replace a note's tags wholesale. Unknown names are created. */
export async function setNoteTags(noteId: NoteId, names: string[]): Promise<Tag[]> {
  const unique = [...new Set(names.map(normalizeTagName).filter((n) => n !== ""))];
  const tags = await Promise.all(unique.map((name) => createTag(name)));

  await db().transaction("rw", db().noteTags, db().tombstones, async () => {
    const previous = await db().noteTags.where("noteId").equals(noteId).toArray();
    const keep = new Set(tags.map((tag) => tag.id));
    for (const link of previous) {
      if (!keep.has(link.tagId)) {
        await markTombstone("note_tags", `${noteId}|${link.tagId}`);
      }
    }
    await db().noteTags.where("noteId").equals(noteId).delete();
    await db().noteTags.bulkAdd(
      tags.map((tag) => ({ id: newId(), noteId, tagId: tag.id })),
    );
  });

  return tags.sort((a, b) => a.name.localeCompare(b.name));
}

export async function removeTagFromNote(noteId: NoteId, tagId: TagId): Promise<void> {
  await db().transaction("rw", db().noteTags, db().tombstones, async () => {
    await db().noteTags.where("[noteId+tagId]").equals([noteId, tagId]).delete();
    await markTombstone("note_tags", `${noteId}|${tagId}`);
  });
}

/** Note ids carrying a tag — drives tag filtering in the note list. */
export async function noteIdsForTag(tagId: TagId): Promise<NoteId[]> {
  const links = await db().noteTags.where("tagId").equals(tagId).toArray();
  return [...new Set(links.map((link) => link.noteId))];
}

export async function noteCountForTag(tagId: TagId): Promise<number> {
  return db().noteTags.where("tagId").equals(tagId).count();
}

/** Drop tags no note references any more. */
export async function pruneUnusedTags(): Promise<number> {
  const database = db();
  return database.transaction(
    "rw",
    database.tags,
    database.noteTags,
    database.tombstones,
    async () => {
      const links = await database.noteTags.toArray();
      const used = new Set(links.map((link) => link.tagId));
      const all = await database.tags.toArray();
      const doomed = all.filter((tag) => !used.has(tag.id)).map((tag) => tag.id);
      if (doomed.length > 0) {
        await database.tags.bulkDelete(doomed);
        for (const id of doomed) await markTombstone("tags", id);
      }
      return doomed.length;
    },
  );
}

export async function allTagsInUse(): Promise<Tag[]> {
  const links = await db().noteTags.toArray();
  const used = new Set(links.map((link) => link.tagId));
  const all = await db().tags.toArray();
  return all.filter((tag) => used.has(tag.id));
}
