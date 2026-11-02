import { describe, expect, it } from "vitest";
import {
  buildNotebookTree,
  descendantIds,
  flattenTree,
  isSelfOrDescendant,
  reindexPositions,
  wouldCreateCycle,
} from "./tree";
import type { Notebook, NotebookId } from "./types";

let counter = 0;
function nb(name: string, parentId: NotebookId | null, position = counter++): Notebook {
  return {
    id: `nb-${name}-${position}`,
    parentId,
    name,
    position,
    createdAt: 0,
    updatedAt: 0,
  };
}

/* Work ─ Engineering ─ Backend
   ├─ Frontend
   Personal
   Ideas */
function fixture() {
  counter = 0;
  const work = nb("Work", null, 0);
  const personal = nb("Personal", null, 1);
  const ideas = nb("Ideas", null, 2);
  const eng = nb("Engineering", work.id, 3);
  const backend = nb("Backend", eng.id, 4);
  const frontend = nb("Frontend", eng.id, 5);
  return { work, personal, ideas, eng, backend, frontend };
}

describe("buildNotebookTree", () => {
  it("nests children under parents and orders by position", () => {
    const f = fixture();
    const tree = buildNotebookTree([f.work, f.personal, f.ideas, f.eng, f.backend, f.frontend]);

    expect(tree.map((n) => n.name)).toEqual(["Work", "Personal", "Ideas"]);

    const work = tree[0];
    expect(work.children.map((n) => n.name)).toEqual(["Engineering"]);
    expect(work.children[0].children.map((n) => n.name)).toEqual(["Backend", "Frontend"]);
    expect(work.depth).toBe(0);
    expect(work.children[0].depth).toBe(1);
    expect(work.children[0].children[0].depth).toBe(2);
  });

  it("rolls note counts up through the tree", () => {
    const f = fixture();
    const counts = new Map<NotebookId, number>([
      [f.work.id, 1],
      [f.eng.id, 2],
      [f.backend.id, 3],
    ]);

    const tree = buildNotebookTree([f.work, f.eng, f.backend], counts);

    expect(tree[0].noteCount).toBe(1);
    expect(tree[0].totalNoteCount).toBe(6); // 1 + 2 + 3
    expect(tree[0].children[0].totalNoteCount).toBe(5); // 2 + 3
  });

  it("promotes a notebook whose parent is missing instead of dropping it", () => {
    counter = 0;
    const orphan = nb("Orphan", "does-not-exist", 0);
    const tree = buildNotebookTree([orphan]);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("Orphan");
  });

  it("promotes notebooks trapped in a cycle so they stay reachable", () => {
    counter = 0;
    const a = nb("A", null, 0);
    const b = nb("B", a.id, 1);
    a.parentId = b.id; // genuine A -> B -> A cycle, no root

    const tree = buildNotebookTree([a, b]);

    // Neither is reachable from a root, so both are promoted rather than
    // disappearing from the sidebar.
    expect(tree.map((n) => n.name).sort()).toEqual(["A", "B"]);
    for (const node of tree) {
      expect(node.depth).toBe(0);
      // Each may appear to contain the other, but must not nest forever.
      expect(node.children.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("isSelfOrDescendant", () => {
  it("finds a node several levels down", () => {
    const f = fixture();
    const byId = new Map(
      [f.work, f.personal, f.ideas, f.eng, f.backend, f.frontend].map((n) => [n.id, n]),
    );

    expect(isSelfOrDescendant(f.backend.id, f.work.id, byId)).toBe(true);
    expect(isSelfOrDescendant(f.frontend.id, f.work.id, byId)).toBe(true);
    expect(isSelfOrDescendant(f.personal.id, f.work.id, byId)).toBe(false);
  });

  it("treats a node as its own descendant", () => {
    const f = fixture();
    const byId = new Map([[f.work.id, f.work]]);
    expect(isSelfOrDescendant(f.work.id, f.work.id, byId)).toBe(true);
  });

  it("terminates on cyclic data instead of hanging", () => {
    counter = 0;
    const a = nb("A", null, 0);
    const b = nb("B", a.id, 1);
    a.parentId = b.id; // genuine A -> B -> A cycle
    const byId = new Map([
      [a.id, a],
      [b.id, b],
    ]);

    expect(isSelfOrDescendant(a.id, "missing", byId)).toBe(false);
  });
});

describe("wouldCreateCycle", () => {
  it("refuses moving a notebook into its own subtree", () => {
    const f = fixture();
    const all = [f.work, f.personal, f.ideas, f.eng, f.backend, f.frontend];

    expect(wouldCreateCycle(all, f.work.id, f.eng.id)).toBe(true);
    expect(wouldCreateCycle(all, f.work.id, f.backend.id)).toBe(true);
    expect(wouldCreateCycle(all, f.eng.id, f.frontend.id)).toBe(true);
  });

  it("refuses making a notebook its own parent", () => {
    const f = fixture();
    expect(wouldCreateCycle([f.work], f.work.id, f.work.id)).toBe(true);
  });

  it("allows moving to the root or to an unrelated branch", () => {
    const f = fixture();
    const all = [f.work, f.personal, f.ideas, f.eng, f.backend, f.frontend];

    expect(wouldCreateCycle(all, f.work.id, null)).toBe(false);
    expect(wouldCreateCycle(all, f.frontend.id, f.ideas.id)).toBe(false);
  });
});

describe("descendantIds", () => {
  it("collects the whole subtree, excluding the root", () => {
    const f = fixture();
    const all = [f.work, f.personal, f.ideas, f.eng, f.backend, f.frontend];
    const ids = descendantIds(all, f.work.id);

    expect(ids).toEqual(new Set([f.eng.id, f.backend.id, f.frontend.id]));
  });

  it("returns an empty set for a leaf", () => {
    const f = fixture();
    expect(descendantIds([f.eng, f.backend], f.backend.id).size).toBe(0);
  });
});

describe("flattenTree", () => {
  it("emits depth-first order", () => {
    const f = fixture();
    const tree = buildNotebookTree([f.work, f.personal, f.ideas, f.eng, f.backend, f.frontend]);

    expect(flattenTree(tree).map((n) => n.name)).toEqual([
      "Work",
      "Engineering",
      "Backend",
      "Frontend",
      "Personal",
      "Ideas",
    ]);
  });
});

describe("reindexPositions", () => {
  it("densifies positions within each parent group", () => {
    counter = 0;
    const a = nb("A", null, 0);
    const b = nb("B", null, 9);
    const c = nb("C", null, 4);

    const positions = reindexPositions([a, b, c]);

    expect(positions.get(a.id)).toBe(0);
    expect(positions.get(c.id)).toBe(1);
    expect(positions.get(b.id)).toBe(2);
  });
});
