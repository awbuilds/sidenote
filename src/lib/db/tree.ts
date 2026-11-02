import type { Notebook, NotebookId, NotebookNode } from "./types";

/**
 * Children of each parent, built once. Keys are parent ids; the `null` key
 * holds top-level notebooks.
 */
function indexChildren(notebooks: Notebook[]): Map<NotebookId | null, Notebook[]> {
  const known = new Set(notebooks.map((n) => n.id));
  const byParent = new Map<NotebookId | null, Notebook[]>();

  for (const notebook of notebooks) {
    // Defensive: a dangling parentId (deleted parent, corrupt import) is
    // treated as a root rather than orphaning the notebook entirely.
    const parentId =
      notebook.parentId !== null && known.has(notebook.parentId) ? notebook.parentId : null;
    const bucket = byParent.get(parentId);
    if (bucket) bucket.push(notebook);
    else byParent.set(parentId, [notebook]);
  }

  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }

  return byParent;
}

/**
 * Build the nested tree.
 *
 * Tolerates corrupt input rather than trusting it:
 *  - a dangling `parentId` is treated as a root,
 *  - a cycle in stored data is broken at the point of detection,
 *  - any notebook that the root pass never reaches (because it is trapped in a
 *    cycle) is promoted to a root afterwards, so bad data can never make a
 *    notebook silently vanish from the sidebar.
 */
export function buildNotebookTree(
  notebooks: Notebook[],
  noteCounts: Map<NotebookId, number> = new Map(),
): NotebookNode[] {
  const byParent = indexChildren(notebooks);
  const emitted = new Set<NotebookId>();

  const build = (parentId: NotebookId | null, depth: number, path: Set<NotebookId>): NotebookNode[] => {
    const children = byParent.get(parentId) ?? [];
    const nodes: NotebookNode[] = [];

    for (const notebook of children) {
      if (path.has(notebook.id)) {
        // Cycle in stored data. Skip this edge; `path` still terminates the walk.
        continue;
      }
      path.add(notebook.id);
      emitted.add(notebook.id);
      const ownCount = noteCounts.get(notebook.id) ?? 0;
      const descendants = build(notebook.id, depth + 1, path);
      const totalNoteCount =
        ownCount + descendants.reduce((sum, child) => sum + child.totalNoteCount, 0);
      path.delete(notebook.id);

      nodes.push({ ...notebook, depth, children: descendants, noteCount: ownCount, totalNoteCount });
    }

    return nodes;
  };

  const roots = build(null, 0, new Set());

  // Recovery pass: anything trapped in a cycle never appeared above. Promote
  // it to a root so it stays reachable and can be fixed by the user.
  const stranded = notebooks
    .filter((notebook) => !emitted.has(notebook.id))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  for (const notebook of stranded) {
    const ownCount = noteCounts.get(notebook.id) ?? 0;
    const descendants = build(notebook.id, 1, new Set([notebook.id]));
    roots.push({
      ...notebook,
      depth: 0,
      children: descendants,
      noteCount: ownCount,
      totalNoteCount: ownCount + descendants.reduce((s, c) => s + c.totalNoteCount, 0),
    });
  }

  return roots;
}

/**
 * True when `candidateId` is `ancestorId` or sits anywhere beneath it.
 * Walks parent links upward, so cost is tree depth, not tree size.
 */
export function isSelfOrDescendant(
  candidateId: NotebookId,
  ancestorId: NotebookId,
  byId: Map<NotebookId, Notebook>,
): boolean {
  const seen = new Set<NotebookId>();
  let current: NotebookId | null = candidateId;

  while (current !== null) {
    if (current === ancestorId) return true;
    // Guard against a pre-existing cycle rather than looping forever.
    if (seen.has(current)) return false;
    seen.add(current);

    const node: Notebook | undefined = byId.get(current);
    if (!node || node.parentId === null) return false;
    current = node.parentId;
  }

  return false;
}

/**
 * Would re-parenting `movingId` under `newParentId` create a cycle?
 *
 * Refuses: becoming its own parent, and moving under any descendant.
 * Moving to the root (`null`) is always allowed.
 */
export function wouldCreateCycle(
  notebooks: Notebook[],
  movingId: NotebookId,
  newParentId: NotebookId | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === movingId) return true;

  const byId = new Map(notebooks.map((n) => [n.id, n]));
  return isSelfOrDescendant(newParentId, movingId, byId);
}

/**
 * Every id beneath `rootId`, excluding `rootId` itself. Used to cascade
 * deletes and to reject drag-and-drop onto a descendant.
 */
export function descendantIds(notebooks: Notebook[], rootId: NotebookId): Set<NotebookId> {
  const childrenOf = new Map<NotebookId, Notebook[]>();
  for (const notebook of notebooks) {
    if (notebook.parentId === null) continue;
    const bucket = childrenOf.get(notebook.parentId);
    if (bucket) bucket.push(notebook);
    else childrenOf.set(notebook.parentId, [notebook]);
  }

  const found = new Set<NotebookId>();
  const queue: NotebookId[] = [rootId];
  const seen = new Set<NotebookId>([rootId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenOf.get(current) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      found.add(child.id);
      queue.push(child.id);
    }
  }

  return found;
}

/** Flatten a tree depth-first, which is the order the sidebar renders. */
export function flattenTree(nodes: NotebookNode[]): NotebookNode[] {
  const out: NotebookNode[] = [];
  const walk = (list: NotebookNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Renumber `position` to a dense 0..n-1 sequence within each parent group.
 * Called after any insert, delete or move so ordering never drifts.
 */
export function reindexPositions(notebooks: Notebook[]): Map<NotebookId, number> {
  const groups = new Map<NotebookId | null, Notebook[]>();
  for (const notebook of notebooks) {
    const bucket = groups.get(notebook.parentId);
    if (bucket) bucket.push(notebook);
    else groups.set(notebook.parentId, [notebook]);
  }

  const positions = new Map<NotebookId, number>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    group.forEach((notebook, index) => positions.set(notebook.id, index));
  }

  return positions;
}
