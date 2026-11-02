import { describe, expect, it } from "vitest";
import { DEFAULT_SORT, sortNotes, type SortState } from "./NoteListControls";

interface Row {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  isPinned: boolean;
}

function note(partial: Partial<Row> & { id: string }): Row {
  return {
    title: partial.id,
    updatedAt: 100,
    createdAt: 100,
    isPinned: false,
    ...partial,
  };
}

const state = (over: Partial<SortState> = {}): SortState => ({ ...DEFAULT_SORT, ...over });

describe("sortNotes", () => {
  it("defaults to most recently updated first", () => {
    const rows = [
      note({ id: "a", updatedAt: 1 }),
      note({ id: "b", updatedAt: 3 }),
      note({ id: "c", updatedAt: 2 }),
    ];
    expect(sortNotes(rows, state()).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by title case-insensitively", () => {
    const rows = [note({ id: "a", title: "banana" }), note({ id: "b", title: "Apple" })];
    expect(sortNotes(rows, state({ sort: "title", direction: "asc" })).map((r) => r.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("sorts by creation date when asked", () => {
    const rows = [
      note({ id: "a", createdAt: 1, updatedAt: 99 }),
      note({ id: "b", createdAt: 5, updatedAt: 1 }),
    ];
    expect(sortNotes(rows, state({ sort: "created", direction: "desc" })).map((r) => r.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("honours ascending direction", () => {
    const rows = [note({ id: "a", updatedAt: 1 }), note({ id: "b", updatedAt: 3 })];
    expect(
      sortNotes(rows, state({ direction: "asc" })).map((r) => r.id),
    ).toEqual(["a", "b"]);
  });

  it("keeps pinned notes above the rest", () => {
    const rows = [
      note({ id: "old-pinned", updatedAt: 1, isPinned: true }),
      note({ id: "newest", updatedAt: 99 }),
    ];
    expect(sortNotes(rows, state()).map((r) => r.id)).toEqual(["old-pinned", "newest"]);
  });

  it("can ignore pinning", () => {
    const rows = [
      note({ id: "old-pinned", updatedAt: 1, isPinned: true }),
      note({ id: "newest", updatedAt: 99 }),
    ];
    expect(sortNotes(rows, state({ pinnedFirst: false })).map((r) => r.id)).toEqual([
      "newest",
      "old-pinned",
    ]);
  });

  it("is stable when the primary key ties — the list must not reshuffle", () => {
    // The bug this guards: autosave updates a note's timestamp, and without a
    // tiebreak a note could jump position on every keystroke.
    const rows = [
      note({ id: "a", updatedAt: 5 }),
      note({ id: "b", updatedAt: 5 }),
      note({ id: "c", updatedAt: 5 }),
    ];
    const first = sortNotes(rows, state()).map((r) => r.id);
    const second = sortNotes([...rows].reverse(), state()).map((r) => r.id);

    expect(first).toEqual(second);
  });

  it("does not mutate its input", () => {
    const rows = [note({ id: "a", updatedAt: 1 }), note({ id: "b", updatedAt: 2 })];
    const before = rows.map((r) => r.id);
    sortNotes(rows, state());
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it("handles an empty list", () => {
    expect(sortNotes([], state())).toEqual([]);
  });

  it("handles a single note", () => {
    expect(sortNotes([note({ id: "only" })], state()).map((r) => r.id)).toEqual(["only"]);
  });
});