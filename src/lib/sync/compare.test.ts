import { describe, expect, it } from "vitest";
import { canonicalJson, noteContentDiffers } from "./compare";

describe("canonicalJson", () => {
  it("ignores object key order, which is what jsonb changes", () => {
    expect(canonicalJson({ type: "text", text: "hi" })).toBe(
      canonicalJson({ text: "hi", type: "text" }),
    );
  });

  it("keeps array order, which is meaningful in a document", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("sorts nested objects too", () => {
    const local = { type: "doc", content: [{ type: "paragraph", attrs: { a: 1, b: 2 } }] };
    const remote = { content: [{ attrs: { b: 2, a: 1 }, type: "paragraph" }], type: "doc" };
    expect(canonicalJson(local)).toBe(canonicalJson(remote));
  });
});

describe("noteContentDiffers", () => {
  const local = {
    title: "Roof",
    contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] },
    contentText: "hi",
    isTrashed: 0 as const,
  };

  it("does not report a conflict when only key order differs", () => {
    expect(
      noteContentDiffers(local, {
        title: "Roof",
        content_json: {
          content: [{ content: [{ text: "hi", type: "text" }], type: "paragraph" }],
          type: "doc",
        },
        content_text: "hi",
        is_trashed: false,
      }),
    ).toBe(false);
  });

  it("reports a real content change", () => {
    expect(
      noteContentDiffers(local, {
        title: "Roof",
        content_json: { type: "doc", content: [{ type: "paragraph" }] },
        content_text: "different",
        is_trashed: false,
      }),
    ).toBe(true);
  });

  it("reports a trash change", () => {
    expect(
      noteContentDiffers(local, {
        title: "Roof",
        content_json: local.contentJson,
        content_text: "hi",
        is_trashed: true,
      }),
    ).toBe(true);
  });
});
