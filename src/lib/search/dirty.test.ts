import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetSearchWork,
  hasSearchWork,
  markSearchDirty,
  markSearchFullRebuild,
  markSearchRemoved,
  takeSearchWork,
} from "./dirty";

beforeEach(() => {
  __resetSearchWork();
});

describe("search work queue", () => {
  it("is empty until something changes", () => {
    expect(hasSearchWork()).toBe(false);
    expect(takeSearchWork()).toBeNull();
  });

  it("coalesces repeated edits of one note", () => {
    markSearchDirty(["a"]);
    markSearchDirty(["a", "b"]);
    expect(takeSearchWork()).toEqual({ kind: "incremental", ids: ["a", "b"], removed: [] });
    expect(hasSearchWork()).toBe(false);
  });

  it("moves an id from dirty to removed when a note is trashed", () => {
    markSearchDirty(["a", "b"]);
    markSearchRemoved(["a"]);
    expect(takeSearchWork()).toEqual({ kind: "incremental", ids: ["b"], removed: ["a"] });
  });

  it("lets a full rebuild absorb pending incremental work", () => {
    markSearchDirty(["a"]);
    markSearchFullRebuild();
    expect(takeSearchWork()).toEqual({ kind: "full" });
    expect(takeSearchWork()).toBeNull();
  });

  it("lets a note return to the index after a restore", () => {
    markSearchRemoved(["a"]);
    markSearchDirty(["a"]);
    expect(takeSearchWork()).toEqual({ kind: "incremental", ids: ["a"], removed: [] });
  });
});
