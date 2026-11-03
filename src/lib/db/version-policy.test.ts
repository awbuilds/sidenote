import { describe, expect, it } from "vitest";
import {
  AUTO_SNAPSHOT_INTERVAL_MS,
  nextSnapshotVersion,
  shouldSnapshot,
} from "./version-policy";

const NOW = 1_700_000_000_000;

describe("shouldSnapshot", () => {
  it("always snapshots the first edit, so the starting state is recoverable", () => {
    expect(
      shouldSnapshot({
        hasHistory: false,
        previousTitle: "A",
        nextTitle: "A",
        lastSnapshotAt: null,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("skips a save inside the interval with no rename", () => {
    expect(
      shouldSnapshot({
        hasHistory: true,
        previousTitle: "A",
        nextTitle: "A",
        lastSnapshotAt: NOW - 60_000,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("snapshots a rename immediately — a title change is a checkpoint", () => {
    expect(
      shouldSnapshot({
        hasHistory: true,
        previousTitle: "A",
        nextTitle: "B",
        lastSnapshotAt: NOW - 1_000,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("snapshots once the interval has passed", () => {
    expect(
      shouldSnapshot({
        hasHistory: true,
        previousTitle: "A",
        nextTitle: "A",
        lastSnapshotAt: NOW - AUTO_SNAPSHOT_INTERVAL_MS,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("treats a whitespace-only rename as no rename", () => {
    expect(
      shouldSnapshot({
        hasHistory: true,
        previousTitle: "A",
        nextTitle: " A ",
        lastSnapshotAt: NOW - 1_000,
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe("nextSnapshotVersion", () => {
  it("uses the note's own counter when it is ahead", () => {
    expect(nextSnapshotVersion(7, 5)).toBe(7);
  });

  it("clears history left by a sync pull that moved the counter backwards", () => {
    expect(nextSnapshotVersion(3, 49)).toBe(50);
  });

  it("is monotonic from an empty history", () => {
    expect(nextSnapshotVersion(1, 0)).toBe(1);
  });
});
