import { describe, expect, it } from "vitest";
import { formatDateTime, pluralize, preview, relativeTime } from "./format";
import { formatBytes } from "./storage/quota";

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("collapses anything recent to 'just now'", () => {
    expect(relativeTime(NOW, NOW)).toBe("just now");
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now");
  });

  it("uses minutes, hours and days", () => {
    expect(relativeTime(NOW - 5 * MINUTE, NOW)).toBe("5m");
    expect(relativeTime(NOW - 3 * HOUR, NOW)).toBe("3h");
    expect(relativeTime(NOW - 2 * DAY, NOW)).toBe("2d");
  });

  it("switches to a date after a week", () => {
    expect(relativeTime(NOW - 10 * DAY, NOW)).toMatch(/\d/);
  });

  it("does not produce negative durations for clock skew", () => {
    // A future timestamp must not read as a negative age.
    expect(relativeTime(NOW + 5 * MINUTE, NOW)).toBe("just now");
  });
});

describe("preview", () => {
  it("takes the first non-empty line", () => {
    expect(preview("\n\n  Title line  \nsecond line")).toBe("Title line");
  });

  it("clips with an ellipsis and no trailing space", () => {
    const long = "x".repeat(200);
    const result = preview(long, 20);
    expect(result).toHaveLength(20);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns an empty string for empty content", () => {
    expect(preview("")).toBe("");
    expect(preview("\n \n")).toBe("");
  });

  it("does not clip text that fits", () => {
    expect(preview("short", 100)).toBe("short");
  });
});

describe("pluralize", () => {
  it("uses the singular for one and the plural otherwise", () => {
    expect(pluralize(0, "note")).toBe("0 notes");
    expect(pluralize(1, "note")).toBe("1 note");
    expect(pluralize(2, "note")).toBe("2 notes");
  });

  it("accepts an irregular plural", () => {
    expect(pluralize(1, "notebook", "notebooks")).toBe("1 notebook");
    expect(pluralize(3, "notebook", "notebooks")).toBe("3 notebooks");
  });
});

describe("formatBytes", () => {
  it("scales through the units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024 * 5)).toBe("5.0 MB");
    expect(formatBytes(1024 ** 3 * 2)).toBe("2.0 GB");
  });

  it("rounds once the number is large", () => {
    expect(formatBytes(1024 * 1024 * 15)).toBe("15 MB");
  });

  it("returns a dash for values it cannot use", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("returns something non-empty and parseable", () => {
    const formatted = formatDateTime(NOW);
    expect(formatted.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(formatted))).toBe(false);
  });
});

describe("preview with wiki links", () => {
  it("flattens a link to its title", () => {
    expect(preview("[[Reading list]] Roadmap")).toBe("Reading list Roadmap");
  });

  it("prefers the alias when there is one", () => {
    expect(preview("see [[Long Title|the short one]] here")).toBe("see the short one here");
  });

  it("leaves a malformed link alone rather than eating text", () => {
    expect(preview("[[unclosed text")).toBe("[[unclosed text");
  });

  it("still finds the first non-empty line", () => {
    expect(preview("\n\n[[A]] second line")).toBe("A second line");
  });

  it("truncates after flattening, not before", () => {
    // Flattening first is what makes the budget apply to visible characters.
    const long = `${"[[A very long note title indeed]]"} tail`;
    expect(preview(long, 20).length).toBeLessThanOrEqual(20);
  });

  it("handles text with no links", () => {
    expect(preview("plain body")).toBe("plain body");
  });
});
