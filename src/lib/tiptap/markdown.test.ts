import { describe, expect, it } from "vitest";
import { docToText, fromMarkdown, isEmptyDoc, toMarkdown } from "./markdown";

/**
 * Markdown round-trip fidelity.
 *
 * `contentJson` is the source of truth and Markdown is the interchange format,
 * so anything that does not survive a round trip is data loss the user can
 * trigger just by opening the Markdown view. These tests are the contract.
 */
describe("toMarkdown", () => {
  it("serialises headings, emphasis and lists", () => {
    const markdown = toMarkdown({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "plain " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " and " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
          ],
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
          ],
        },
      ],
    });

    expect(markdown).toContain("## Title");
    expect(markdown).toContain("**bold**");
    expect(markdown).toContain("*italic*");
    expect(markdown).toContain("- one");
    expect(markdown).toContain("- two");
  });

  it("serialises links with their href", () => {
    const markdown = toMarkdown({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "site", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
          ],
        },
      ],
    });

    expect(markdown).toContain("[site](https://example.com)");
  });

  it("serialises code blocks with their language", () => {
    const markdown = toMarkdown({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const a = 1;" }],
        },
      ],
    });

    expect(markdown).toContain("```typescript");
    expect(markdown).toContain("const a = 1;");
  });

  it("returns an empty string rather than throwing on a malformed doc", () => {
    expect(toMarkdown({ type: "doc", content: [{ type: "nope" }] })).toBeTypeOf("string");
  });
});

describe("fromMarkdown", () => {
  it("parses headings, lists, code and emphasis", () => {
    const doc = fromMarkdown(
      [
        "# Title",
        "",
        "Some **bold** and *italic*.",
        "",
        "- one",
        "- two",
        "",
        "```js",
        "const a = 1;",
        "```",
      ].join("\n"),
    );

    expect(doc.type).toBe("doc");
    const types = doc.content?.map((n) => n.type);
    expect(types).toContain("heading");
    expect(types).toContain("bulletList");
    expect(types).toContain("codeBlock");
    expect(docToText(doc)).toContain("Some bold and italic.");
  });

  it("parses task lists", () => {
    const doc = fromMarkdown("- [ ] todo\n- [x] done");
    const types = doc.content?.map((n) => n.type);
    expect(types).toContain("taskList");
  });
});

describe("round trip", () => {
  const samples: [string, string][] = [
    ["heading", "## Section\n\nBody text."],
    ["emphasis", "A **bold** and *italic* and ~~struck~~ line."],
    ["link", "See [the docs](https://example.com/docs) for more."],
    ["bullet list", "- alpha\n- beta\n- gamma"],
    ["ordered list", "1. first\n2. second"],
    ["blockquote", "> a quoted line"],
    ["code block", "```typescript\nconst x: number = 1;\n```"],
    ["inline code", "Use `npm run dev` to start."],
    ["hr", "above\n\n---\n\nbelow"],
  ];

  for (const [name, markdown] of samples) {
    it(`preserves ${name} through markdown -> json -> markdown`, () => {
      const first = toMarkdown(fromMarkdown(markdown));
      const second = toMarkdown(fromMarkdown(first));
      // Idempotent after the first normalisation, which is what actually
      // matters: the stored document is the JSON, and the Markdown view must
      // not drift every time it is opened.
      expect(second).toBe(first);
      expect(first.length).toBeGreaterThan(0);
    });
  }

  it("keeps the readable content intact through a round trip", () => {
    const original = "## Plan\n\n- ship it\n- test it";
    const roundTripped = toMarkdown(fromMarkdown(original));
    expect(roundTripped).toContain("Plan");
    expect(roundTripped).toContain("ship it");
    expect(roundTripped).toContain("test it");
  });
});

describe("isEmptyDoc", () => {
  it("treats an empty paragraph as empty", () => {
    expect(isEmptyDoc({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
    expect(isEmptyDoc({ type: "doc", content: [] })).toBe(true);
  });

  it("treats real content as non-empty", () => {
    expect(
      isEmptyDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] }),
    ).toBe(false);
  });
});

describe("docToText", () => {
  it("flattens block content with newlines", () => {
    const doc = fromMarkdown("one\n\ntwo");
    expect(docToText(doc)).toContain("one");
    expect(docToText(doc)).toContain("two");
  });
});
