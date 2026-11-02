import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { renderSharedHtml, withoutLocalImages } from "./render";

const doc: JSONContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Roof" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "The " },
        { type: "text", marks: [{ type: "bold" }], text: "roof" },
        { type: "text", text: " is fine." },
      ],
    },
    { type: "image", attrs: { src: "attachment://abc-123", alt: "photo" } },
    { type: "image", attrs: { src: "https://example.com/x.png", alt: "remote" } },
  ],
};

describe("renderSharedHtml", () => {
  it("renders the document structure and marks", () => {
    const html = renderSharedHtml(doc);
    expect(html).toContain("<h1>Roof</h1>");
    expect(html).toContain("<strong>roof</strong>");
  });

  it("replaces locally-stored images with a placeholder", () => {
    const html = renderSharedHtml(doc);
    expect(html).not.toContain("attachment://");
    expect(html).toContain("Image not included in shared links yet");
  });

  it("keeps remote images", () => {
    const html = renderSharedHtml(doc);
    expect(html).toContain('src="https://example.com/x.png"');
  });

  it("survives a malformed document", () => {
    expect(renderSharedHtml({ type: "doc", content: [{ type: "nope" }] })).toContain("could not be displayed");
  });
});

describe("withoutLocalImages", () => {
  it("is identity for documents without attachments", () => {
    const plain: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    };
    expect(withoutLocalImages(plain)).toEqual(plain);
  });
});
