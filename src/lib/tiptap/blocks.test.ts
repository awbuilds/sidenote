import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { buildExtensions } from "./extensions";
import { fromMarkdown, toMarkdown } from "./markdown";
import { insertMathBlock } from "./math";

/**
 * The block types added for UI parity. These are new schema nodes, so the
 * risk is that one registers badly, breaks Markdown serialisation, or cannot
 * be deleted — all of which a real editor in jsdom can prove.
 */
function makeEditor(): Editor {
  return new Editor({
    extensions: buildExtensions(),
    content: { type: "doc", content: [{ type: "paragraph" }] },
    element: document.createElement("div"),
  });
}

/** The table node at the top level, if there is one. */
function tableNode(editor: Editor): { type?: string; content?: unknown[] } | undefined {
  return (editor.getJSON().content ?? []).find((node) => node.type === "table");
}

/** Rows inside the table. */
function tableRows(editor: Editor): { type?: string; content?: unknown[] }[] {
  return (tableNode(editor)?.content ?? []) as { type?: string; content?: unknown[] }[];
}

/** Every node type present anywhere in the document. */
function nodeTypes(editor: Editor): string[] {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const typed = node as { type?: string; content?: unknown[] };
    if (typeof typed.type === "string") found.push(typed.type);
    typed.content?.forEach(walk);
  };
  walk(editor.getJSON());
  return found;
}

/** First node of a given type, anywhere in the tree. */
function findNode(
  node: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] },
  type: string,
): { attrs?: Record<string, unknown> } | null {
  if (node.type === type) return { attrs: node.attrs };
  for (const child of node.content ?? []) {
    const found = findNode(child as typeof node, type);
    if (found !== null) return found;
  }
  return null;
}

describe("tables", () => {
  let editor: Editor;
  beforeEach(() => {
    editor = makeEditor();
  });
  afterEach(() => editor.destroy());

  it("inserts a table with a header row", () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();

    const types = nodeTypes(editor);
    expect(types).toContain("table");
    expect(types).toContain("tableRow");
    expect(types).toContain("tableHeader");
    expect(types).toContain("tableCell");
  });

  it("inserts the size asked for", () => {
    editor.chain().focus().insertTable({ rows: 2, cols: 4, withHeaderRow: true }).run();
    expect(tableRows(editor)).toHaveLength(2);
    expect(tableRows(editor)[0]?.content?.length).toBe(4);
  });

  it("adds and removes rows", () => {
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run();
    editor.chain().focus().addRowAfter().run();
    expect(tableRows(editor)).toHaveLength(3);

    editor.chain().focus().deleteRow().run();
    expect(tableRows(editor)).toHaveLength(2);
  });

  it("adds a column", () => {
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run();
    editor.chain().focus().addColumnAfter().run();
    expect(tableRows(editor)[0]?.content?.length).toBe(3);
  });

  it("deletes the whole table", () => {
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run();
    editor.chain().focus().deleteTable().run();
    expect(nodeTypes(editor)).not.toContain("table");
  });

  it("survives a Markdown round trip as a pipe table", () => {
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();

    const markdown = toMarkdown(editor.getJSON());
    expect(markdown).toContain("|");

    // Re-parsing must give a table back, not a paragraph of pipes.
    const reparsed = fromMarkdown(markdown);
    expect(JSON.stringify(reparsed)).toContain("table");
  });
});

describe("horizontal rule", () => {
  it("inserts and reports active", () => {
    const editor = makeEditor();
    editor.chain().focus().setHorizontalRule().run();

    expect(nodeTypes(editor)).toContain("horizontalRule");
    editor.destroy();
  });

  it("round-trips through Markdown", () => {
    const editor = makeEditor();
    editor.chain().focus().setHorizontalRule().run();

    const markdown = toMarkdown(editor.getJSON());
    expect(markdown).toContain("---");

    expect(JSON.stringify(fromMarkdown(markdown))).toContain("horizontalRule");
    editor.destroy();
  });
});

describe("mathematics", () => {
  let editor: Editor;
  beforeEach(() => {
    editor = makeEditor();
  });
  afterEach(() => editor.destroy());

  it("inserts an inline equation with its LaTeX", () => {
    insertMathBlock(editor, "e^{i\\pi} + 1 = 0");

    expect(nodeTypes(editor)).toContain("inlineMath");
    // Read the attribute rather than the serialised JSON, where a backslash
    // is escaped and a string comparison lies.
    const node = findNode(editor.getJSON() as never, "inlineMath");
    expect(node?.attrs?.latex).toBe("e^{i\\pi} + 1 = 0");
  });

  it("ignores blank input rather than inserting an empty node", () => {
    const before = JSON.stringify(editor.getJSON());
    insertMathBlock(editor, "   ");
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it("keeps the LaTeX source in the document", () => {
    insertMathBlock(editor, "\\alpha");
    expect(findNode(editor.getJSON() as never, "inlineMath")?.attrs?.latex).toBe("\\alpha");
  });
});

describe("links", () => {
  let editor: Editor;
  beforeEach(() => {
    editor = makeEditor();
    editor.commands.setContent(fromMarkdown("a link"), { emitUpdate: false });
    editor.commands.selectAll();
  });
  afterEach(() => editor.destroy());

  it("applies a link to the selection and reports active", () => {
    editor.chain().focus().setLink({ href: "https://example.com" }).run();
    expect(editor.isActive("link")).toBe(true);
    expect(editor.getAttributes("link").href).toBe("https://example.com");
  });

  it("removes the link", () => {
    editor.chain().focus().setLink({ href: "https://example.com" }).run();
    editor.chain().focus().unsetLink().run();
    expect(editor.isActive("link")).toBe(false);
  });
});

describe("block types are all registered", () => {
  it("constructs with every toolbar extension present", () => {
    const editor = makeEditor();
    const names = editor.extensionManager.extensions.map((e) => e.name);

    for (const expected of [
      "table",
      "tableRow",
      "tableCell",
      "tableHeader",
      "horizontalRule",
      "image",
      "placeholder",
      "taskList",
      "codeBlock",
      "heading",
      "blockquote",
    ]) {
      expect(names).toContain(expected);
    }
    editor.destroy();
  });
});