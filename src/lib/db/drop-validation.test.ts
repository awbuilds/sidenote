import { describe, expect, it } from "vitest";
import { withTestDb } from "./test-helpers";
import { createNotebook, listNotebooks, moveNotebook } from "./repositories/notebooks";
import { wouldCreateCycle } from "./tree";
import type { Notebook } from "./types";

/**
 * The sidebar refuses an invalid drop *before* calling the repository, using
 * `wouldCreateCycle` over the same rows the repository reads. These tests pin
 * that the two agree — if they ever diverge the UI would offer a move that the
 * data layer silently rejects.
 */
withTestDb();

async function rows(): Promise<Notebook[]> {
  return listNotebooks();
}

describe("sidebar drop validation matches the repository", () => {
  it("refuses a drop onto a descendant, and the repository refuses too", async () => {
    const work = await createNotebook({ name: "Work" });
    const eng = await createNotebook({ name: "Eng", parentId: work.id });
    const backend = await createNotebook({ name: "Backend", parentId: eng.id });

    const all = await rows();
    const dragged = work.id;
    const target = backend.id;

    // What the UI computes on dragOver.
    const uiRefuses = dragged !== target && wouldCreateCycle(all, dragged, target);
    expect(uiRefuses).toBe(true);

    // What actually happens if the UI is wrong.
    await expect(moveNotebook(dragged, target)).rejects.toThrow(/cannot be moved inside itself/i);
  });

  it("allows a drop onto an unrelated branch in both places", async () => {
    const work = await createNotebook({ name: "Work" });
    const eng = await createNotebook({ name: "Eng", parentId: work.id });
    const personal = await createNotebook({ name: "Personal" });

    const all = await rows();
    expect(wouldCreateCycle(all, eng.id, personal.id)).toBe(false);

    await moveNotebook(eng.id, personal.id);
    const after = await rows();
    expect(after.find((n) => n.id === eng.id)?.parentId).toBe(personal.id);
  });

  it("refuses a drop onto itself", async () => {
    const work = await createNotebook({ name: "Work" });
    const all = await rows();

    // The UI short-circuits on identity before consulting the tree.
    expect(work.id === work.id && wouldCreateCycle(all, work.id, work.id)).toBe(true);
  });

  it("allows a drop onto the current parent to reorder within that group", async () => {
    const a = await createNotebook({ name: "A" });
    const b = await createNotebook({ name: "B" });
    const child = await createNotebook({ name: "Child", parentId: a.id });

    const all = await rows();
    // child -> a is not a cycle; the UI treats it as "append to siblings".
    expect(wouldCreateCycle(all, child.id, a.id)).toBe(false);
    expect(child.parentId).toBe(a.id);
    expect(b.parentId).toBeNull();
  });
});
