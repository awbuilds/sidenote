import { describe, expect, it } from "vitest";
import {
  collectHeadings,
  countText,
  flattenOutline,
  nestHeadings,
  outlineFromDoc,
} from "./outline";
import { fromMarkdown } from "./markdown";

const doc = fromMarkdown(
  [
    "# Top",
    "text",
    "## Second",
    "text",
    "### Deep",
    "text",
    "## Another second",
    "# Second top",
  ].join("\n\n"),
);

describe("collectHeadings", () => {
  it("finds every heading with its level and text", () => {
    const headings = collectHeadings(doc);
    expect(headings.map((h) => [h.level, h.text])).toEqual([
      [1, "Top"],
      [2, "Second"],
      [3, "Deep"],
      [2, "Another second"],
      [1, "Second top"],
    ]);
  });

  it("returns nothing for a document with no headings", () => {
    expect(collectHeadings(fromMarkdown("just a paragraph"))).toEqual([]);
  });

  it("ignores non-heading nodes", () => {
    const headings = collectHeadings(
      fromMarkdown("- a list item\n\n> a quote\n\n```\ncode\n```"),
    );
    expect(headings).toEqual([]);
  });
});

describe("nestHeadings", () => {
  it("nests by level", () => {
    const tree = outlineFromDoc(doc);

    expect(tree).toHaveLength(2);
    expect(tree[0].text).toBe("Top");
    expect(tree[0].children.map((c) => c.text)).toEqual(["Second", "Another second"]);
    expect(tree[0].children[0].children.map((c) => c.text)).toEqual(["Deep"]);
    expect(tree[1].text).toBe("Second top");
  });

  it("attaches a skipped level to the nearest shallower ancestor", () => {
    // h1 -> h3 with no h2 in between must not orphan the h3.
    const flat = collectHeadings(fromMarkdown("# One\n\n### Three"));
    const tree = nestHeadings(flat);

    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.text)).toEqual(["Three"]);
  });

  it("handles a document starting mid-hierarchy", () => {
    // The editor's schema supports h1–h3; starting at h2 and nesting to h3
    // is the deepest "starts below the top level" case that exists.
    const flat = collectHeadings(fromMarkdown("## Starts deep\n\n### Deeper"));
    const tree = nestHeadings(flat);

    expect(tree).toHaveLength(1);
    expect(tree[0].level).toBe(2);
    expect(tree[0].children[0].level).toBe(3);
  });

  it("does not nest a later same-level heading under an earlier one", () => {
    const tree = nestHeadings(collectHeadings(fromMarkdown("# A\n\n# B")));
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(0);
  });
});

describe("flattenOutline", () => {
  it("emits depth-first with depth", () => {
    const rows = flattenOutline(outlineFromDoc(doc));
    expect(rows.map((r) => [r.depth, r.node.text])).toEqual([
      [0, "Top"],
      [1, "Second"],
      [2, "Deep"],
      [1, "Another second"],
      [0, "Second top"],
    ]);
  });

  it("gives every row a unique id for React keys", () => {
    const rows = flattenOutline(outlineFromDoc(doc));
    expect(new Set(rows.map((r) => r.node.id)).size).toBe(rows.length);
  });
});

describe("countText", () => {
  it("counts words and characters", () => {
    const result = countText(fromMarkdown("hello world"));
    expect(result.words).toBe(2);
    expect(result.characters).toBe(11);
  });

  it("returns zeroes for an empty document", () => {
    expect(countText({ type: "doc", content: [{ type: "paragraph" }] })).toEqual({
      words: 0,
      characters: 0,
      blocks: 0,
    });
  });

  it("counts non-empty blocks", () => {
    const result = countText(fromMarkdown("# One\n\nbody\n\n\n\nlast"));
    expect(result.blocks).toBe(3);
  });

  it("does not count whitespace as words", () => {
    expect(countText(fromMarkdown("   \n\n  \n")).words).toBe(0);
  });
});
