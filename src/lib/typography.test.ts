import { describe, expect, it } from "vitest";
import { editorTypographyClass } from "./typography";

describe("editorTypographyClass", () => {
  it("maps the width preference to the reading measure", () => {
    expect(editorTypographyClass({ font: "sans", width: "narrow", lineHeight: "normal" })).toContain(
      "max-w-[60ch]",
    );
    expect(editorTypographyClass({ font: "sans", width: "medium", lineHeight: "normal" })).toContain(
      "max-w-[72ch]",
    );
    expect(editorTypographyClass({ font: "sans", width: "wide", lineHeight: "normal" })).toContain(
      "max-w-[84ch]",
    );
  });

  it("maps font and line height", () => {
    const classes = editorTypographyClass({ font: "mono", width: "medium", lineHeight: "relaxed" });
    expect(classes).toContain("font-mono");
    expect(classes).toContain("leading-relaxed");
  });
});
