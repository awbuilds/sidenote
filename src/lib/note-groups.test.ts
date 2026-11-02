import { describe, expect, it } from "vitest";
import { groupNotesByDate } from "./note-groups";

const NOW = new Date(2026, 9, 2, 12, 0, 0).getTime(); // Fri 2 Oct 2026, noon
const DAY = 86_400_000;

function note(id: string, ageMs: number, isPinned = false) {
  return { id, isPinned, updatedAt: NOW - ageMs };
}

describe("groupNotesByDate", () => {
  it("buckets by calendar day, not by 24-hour windows", () => {
    const groups = groupNotesByDate(
      [
        note("a", 2 * 3_600_000), // 10:00 today
        note("b", 30 * 3_600_000), // yesterday 06:00
        note("c", 3 * DAY), // 3 days ago
        note("d", 30 * DAY), // last month
      ],
      true,
      NOW,
    );

    expect(groups.map((group) => group.key)).toEqual(["today", "yesterday", "week", "older"]);
    expect(groups[0].notes.map((row) => row.id)).toEqual(["a"]);
    expect(groups[1].notes.map((row) => row.id)).toEqual(["b"]);
    expect(groups[2].notes.map((row) => row.id)).toEqual(["c"]);
    expect(groups[3].notes.map((row) => row.id)).toEqual(["d"]);
  });

  it("puts pinned notes in their own leading group", () => {
    const groups = groupNotesByDate([note("pin", 30 * DAY, true), note("fresh", 1_000)], true, NOW);
    expect(groups.map((group) => group.key)).toEqual(["pinned", "today"]);
    expect(groups[0].notes[0].id).toBe("pin");
  });

  it("keeps pinned notes inline when pinnedFirst is off", () => {
    const groups = groupNotesByDate([note("pin", 30 * DAY, true)], false, NOW);
    expect(groups.map((group) => group.key)).toEqual(["older"]);
  });

  it("omits empty groups", () => {
    const groups = groupNotesByDate([note("only", 1_000)], true, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("today");
  });

  it("treats midnight exactly as today", () => {
    const midnight = new Date(NOW);
    midnight.setHours(0, 0, 0, 0);
    const groups = groupNotesByDate([note("midnight", NOW - midnight.getTime())], true, NOW);
    expect(groups[0].key).toBe("today");
  });
});
