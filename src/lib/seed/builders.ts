import type { JSONContent } from "@tiptap/core";

/* Small builders for TipTap documents, used by the seed. The editor's own
 * Markdown serialisation lands in Phase 5 — until then the seed supplies
 * Markdown and plain text alongside the document. */

export const text = (value: string, marks?: JSONContent["marks"]): JSONContent => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

export const p = (...content: JSONContent[]): JSONContent => ({
  type: "paragraph",
  ...(content.length > 0 ? { content } : {}),
});

export const pt = (value: string): JSONContent => p(text(value));

export const h = (level: 1 | 2 | 3 | 4, value: string): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: [text(value)],
});

export const quote = (value: string): JSONContent => ({
  type: "blockquote",
  content: [pt(value)],
});

export const code = (value: string, language = "typescript"): JSONContent => ({
  type: "codeBlock",
  attrs: { language },
  content: [text(value)],
});

const listItem = (content: JSONContent): JSONContent => ({ type: "listItem", content: [content] });

export const ul = (...items: string[]): JSONContent => ({
  type: "bulletList",
  content: items.map((item) => listItem(pt(item))),
});

export const ol = (...items: string[]): JSONContent => ({
  type: "orderedList",
  content: items.map((item) => listItem(pt(item))),
});

export const tasks = (...items: [string, boolean][]): JSONContent => ({
  type: "taskList",
  content: items.map(([label, checked]) => ({
    type: "taskItem",
    attrs: { checked },
    content: [pt(label)],
  })),
});

export const image = (attrs: { src: string; alt?: string; title?: string }): JSONContent => ({
  type: "image",
  attrs,
});

/**
 * A table with a header row.
 *
 * `colwidths` is required by the TipTap table schema even though the rendering
 * is `table-layout: fixed` — the cells take their width from CSS, and the
 * attribute only has to be present and well-formed.
 */
export function table(headers: string[], rows: string[][]): JSONContent {
  const columns = headers.length;

  const cell = (value: string, type: "tableHeader" | "tableCell"): JSONContent => ({
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    // A cell with no content, not a cell containing an empty text node.
    // ProseMirror rejects the latter outright — "Empty text nodes are not
    // allowed" — which silently emptied the whole note rather than just the
    // blank cell.
    ...(value === "" ? {} : { content: [pt(value)] }),
  });

  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: headers.map((value) => cell(value, "tableHeader")),
      },
      ...rows.map((row) => ({
        type: "tableRow",
        content: Array.from({ length: columns }, (_, index) =>
          cell(row[index] ?? "", "tableCell"),
        ),
      })),
    ],
  };
}

export const hardBreak = (): JSONContent => ({ type: "hardBreak" });

export const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

// Flattening lives in `@/lib/tiptap/doc` so the seed can use it without
// pulling in the editor bundle.
export { docToText } from "@/lib/tiptap/doc";
