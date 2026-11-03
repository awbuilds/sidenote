import Dexie from "dexie";
import { db } from "../db";
import { fromNotebookRow, toNotebookRow } from "../convert";
import { descendantIds, reindexPositions, wouldCreateCycle } from "../tree";
import type { Notebook, NotebookId, NotebookRow } from "../types";
import { toStorageId } from "../types";
import { purgeNotes } from "./notes";
import { markTombstone } from "./tombstones";

export class NotebookCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotebookCycleError";
  }
}

export class NotebookMissingError extends Error {
  constructor(id: NotebookId) {
    super(`Notebook ${id} does not exist`);
    this.name = "NotebookMissingError";
  }
}

function now(): number {
  return Date.now();
}

function newId(): string {
  return crypto.randomUUID();
}

export async function listNotebooks(): Promise<Notebook[]> {
  const rows = await db().notebooks.toArray();
  return rows.map(fromNotebookRow);
}

async function listNotebookRows(): Promise<NotebookRow[]> {
  return db().notebooks.toArray();
}

/** Count of live (non-trashed) notes per notebook, for the sidebar badges. */
export async function noteCountsByNotebook(): Promise<Map<NotebookId, number>> {
  const counts = new Map<NotebookId, number>();

  // Index keys only: `[notebookId+isTrashed]` answers the question without
  // loading a single note body. The old version read every live note row and
  // threw away everything but the foreign key.
  const keys = (await db()
    .notes.where("[isTrashed+notebookId]")
    .between([0, Dexie.minKey], [0, Dexie.maxKey])
    .keys()) as unknown as [number, string][];

  for (const [, notebookId] of keys) {
    if (notebookId === "") continue;
    counts.set(notebookId, (counts.get(notebookId) ?? 0) + 1);
  }

  return counts;
}

export async function getNotebook(id: NotebookId): Promise<Notebook | undefined> {
  const row = await db().notebooks.get(id);
  return row ? fromNotebookRow(row) : undefined;
}

export async function createNotebook(input: {
  name: string;
  parentId?: NotebookId | null;
}): Promise<Notebook> {
  const name = input.name.trim();
  if (name === "") throw new Error("Notebook name cannot be empty");

  const parentId = input.parentId ?? null;
  if (parentId !== null && (await db().notebooks.get(parentId)) === undefined) {
    throw new NotebookMissingError(parentId);
  }

  // `parentId` is stored as "" for a root notebook so it stays indexable.
  const siblings = await db().notebooks.where("parentId").equals(toStorageId(parentId)).toArray();
  const timestamp = now();

  const notebook: Notebook = {
    id: newId(),
    parentId,
    name,
    position: siblings.length,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db().notebooks.add(toNotebookRow(notebook));
  return notebook;
}

export async function renameNotebook(id: NotebookId, rawName: string): Promise<void> {
  const name = rawName.trim();
  if (name === "") throw new Error("Notebook name cannot be empty");

  const result = await db().notebooks.update(id, { name, updatedAt: now() });
  if (result === 0) throw new NotebookMissingError(id);
}

/**
 * Re-parent a notebook. Refuses any move that would put a notebook inside
 * its own subtree — that would orphan every descendant and can render the
 * sidebar unreadable.
 */
export async function moveNotebook(
  id: NotebookId,
  parentId: NotebookId | null,
  position?: number,
): Promise<void> {
  const database = db();

  await database.transaction("rw", database.notebooks, async () => {
    const all = await database.notebooks.toArray();
    const moving = all.find((n) => n.id === id);
    if (!moving) throw new NotebookMissingError(id);

    if (wouldCreateCycle(all, id, parentId)) {
      throw new NotebookCycleError("A notebook cannot be moved inside itself");
    }

    if (parentId !== null && !all.some((n) => n.id === parentId)) {
      throw new NotebookMissingError(parentId);
    }

    const parentKey = toStorageId(parentId);
    const siblings = all
      .filter((n) => n.parentId === parentKey && n.id !== id)
      .sort((a, b) => a.position - b.position);

    const index =
      position === undefined ? siblings.length : Math.max(0, Math.min(position, siblings.length));
    siblings.splice(index, 0, { ...moving, parentId: parentKey });

    const timestamp = now();
    await database.notebooks.bulkPut(
      siblings.map((notebook, i) => ({
        ...notebook,
        position: i,
        // LWW only pushes rows whose `updatedAt` moved. Stamping just the
        // dragged row left every sibling's new position on this device, so two
        // devices ended up with different orders after a pull.
        updatedAt:
          notebook.id === id || notebook.position !== i ? timestamp : notebook.updatedAt,
      })),
    );
  });
}

/** Persist an explicit sibling order within one parent group. */
export async function reorderNotebooks(
  parentId: NotebookId | null,
  orderedIds: NotebookId[],
): Promise<void> {
  const database = db();
  const parentKey = toStorageId(parentId);

  await database.transaction("rw", database.notebooks, async () => {
    const timestamp = now();
    // `update` rather than `bulkPut`: only position and parent change, and
    // the rows carry fields (name, createdAt) that must not be clobbered.
    await Promise.all(
      orderedIds.map((id, index) =>
        database.notebooks.update(id, { parentId: parentKey, position: index, updatedAt: timestamp }),
      ),
    );
  });
}

export type DeleteNotebookStrategy = "trashNotes" | "purgeNotes" | "unfileNotes";

/**
 * Delete a notebook and everything beneath it.
 *
 * The notebook rows always go. Their notes are handled by the strategy —
 * trashed by default so nothing is lost by surprise.
 */
export async function deleteNotebook(
  id: NotebookId,
  strategy: DeleteNotebookStrategy = "trashNotes",
): Promise<void> {
  const database = db();

  // Dexie's transaction() takes at most six table arguments; pass an array.
  await database.transaction(
    "rw",
    [
      database.notebooks,
      database.notes,
      database.noteTags,
      database.attachments,
      database.versions,
      // Purging the notebook's notes also purges their links, and Dexie refuses
      // to touch a table the parent transaction did not declare.
      database.noteLinks,
      database.settings,
      database.tombstones,
    ],
    async () => {
      const all = await database.notebooks.toArray();
      if (!all.some((n) => n.id === id)) throw new NotebookMissingError(id);

      const affected = new Set<NotebookId>([id, ...descendantIds(all, id)]);
      const timestamp = now();

      if (affected.size > 0) {
        if (strategy === "unfileNotes") {
          await database.notes
            .where("notebookId")
            .anyOf([...affected])
            .modify({ notebookId: "", updatedAt: timestamp });
        } else if (strategy === "trashNotes") {
          await database.notes
            .where("notebookId")
            .anyOf([...affected])
            .modify({ isTrashed: 1, trashedAt: timestamp, updatedAt: timestamp });
        } else {
          const doomed = await database.notes
            .where("notebookId")
            .anyOf([...affected])
            .primaryKeys();
          await purgeNotes([...doomed]);
        }
      }

      await database.notebooks.bulkDelete([...affected]);
      for (const notebookId of affected) await markTombstone("notebooks", notebookId);

      // Renumber survivors so sibling ordering stays dense.
      const remaining = await database.notebooks.toArray();
      const positions = reindexPositions(remaining);
      await database.notebooks.bulkPut(
        remaining.map((notebook) => ({ ...notebook, position: positions.get(notebook.id) ?? 0 })),
      );
    },
  );
}

export async function countNotebooks(): Promise<number> {
  return db().notebooks.count();
}

export { listNotebookRows };
