import { describe, expect, it } from "vitest";
import { normalizeTagColor, tagDotClass } from "./tag-color";

describe("tag colors", () => {
  it("normalises unknown tokens to the default", () => {
    expect(normalizeTagColor("violet")).toBe("violet");
    expect(normalizeTagColor("chartreuse")).toBe("slate");
    expect(normalizeTagColor("")).toBe("slate");
  });

  it("maps every known token to a real class", () => {
    for (const token of ["slate", "violet", "amber", "emerald", "rose", "sky"] as const) {
      expect(tagDotClass(token)).toMatch(/^bg-/);
    }
  });
});
