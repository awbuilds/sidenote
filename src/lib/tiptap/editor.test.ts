import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { buildExtensions } from "./extensions";
import { fromMarkdown, toMarkdown, docToText } from "./markdown";

/**
 * Real TipTap editor, in jsdom.
 *
 * The manager-only tests in markdown.test.ts do not create a schema, so they
 * would not catch a duplicate extension name (which throws on editor
 * construction) or a command that does not exist. This does.
 */
function makeEditor(content = ""): Editor {
  return new Editor({
    extensions: buildExtensions({ placeholder: "Start writing…" }),
    content: content === "" ? { type: "doc", content: [{ type: "paragraph" }] } : fromMarkdown(content),
    // jsdom has no layout; the editor only needs the DOM to exist.
    element: document.createElement("div"),
  });
}

describe("editor construction", () => {
  it("builds without throwing — no duplicate extensions", () => {
    const editor = makeEditor();
    expect(editor).toBeTruthy();
    expect(editor.getJSON().type).toBe("doc");
    editor.destroy();
  });

  it("starts empty and can accept content", () => {
    const editor = makeEditor();
    expect(editor.isEmpty).toBe(true);
    editor.commands.setContent(fromMarkdown("hello"), { emitUpdate: false });
    expect(editor.getText()).toContain("hello");
    editor.destroy();
  });
});

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

/** Select the whole document and apply a command, then report what happened. */
function applyToAll(editor: Editor, run: () => void): string[] {
  editor.commands.selectAll();
  run();
  return nodeTypes(editor);
}

describe("toolbar commands", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = makeEditor();
  });
  afterEach(() => editor.destroy());

  it("toggles bold", () => {
    editor.commands.setContent(fromMarkdown("text"), { emitUpdate: false });
    expect(applyToAll(editor, () => editor.chain().focus().toggleBold().run())).toContain("text");
    const marks = (editor.getJSON().content as { content?: { marks?: unknown[] }[] }[])[0]?.content?.[0]
      ?.marks;
    expect(marks).toEqual([{ type: "bold" }]);
  });

  it("toggles italic", () => {
    editor.commands.setContent(fromMarkdown("text"), { emitUpdate: false });
    applyToAll(editor, () => editor.chain().focus().toggleItalic().run());
    const marks = (editor.getJSON().content as { content?: { marks?: unknown[] }[] }[])[0]?.content?.[0]
      ?.marks;
    expect(marks).toEqual([{ type: "italic" }]);
  });

  it("applies each heading level", () => {
    for (const level of [1, 2, 3] as const) {
      editor.commands.setContent(fromMarkdown("Title"), { emitUpdate: false });
      applyToAll(editor, () => editor.chain().focus().toggleHeading({ level }).run());
      expect(nodeTypes(editor)).toContain("heading");
      const attrs = (editor.getJSON().content as { type?: string; attrs?: { level?: number } }[])[0];
      expect(attrs?.type).toBe("heading");
      expect(attrs?.attrs?.level).toBe(level);
    }
  });

  it("creates bullet, ordered and task lists", () => {
    for (const [command, type] of [
      ["toggleBulletList", "bulletList"],
      ["toggleOrderedList", "orderedList"],
      ["toggleTaskList", "taskList"],
    ] as const) {
      editor.commands.setContent(fromMarkdown("item"), { emitUpdate: false });
      const types = applyToAll(editor, () => {
        if (command === "toggleBulletList") editor.chain().focus().toggleBulletList().run();
        else if (command === "toggleOrderedList") editor.chain().focus().toggleOrderedList().run();
        else editor.chain().focus().toggleTaskList().run();
      });
      expect(types).toContain(type);
    }
  });

  it("toggles blockquote", () => {
    editor.commands.setContent(fromMarkdown("text"), { emitUpdate: false });
    expect(applyToAll(editor, () => editor.chain().focus().toggleBlockquote().run())).toContain(
      "blockquote",
    );
  });

  it("toggles strike and inline code", () => {
    editor.commands.setContent(fromMarkdown("text"), { emitUpdate: false });
    applyToAll(editor, () => editor.chain().focus().toggleStrike().run());
    let marks = (editor.getJSON().content as { content?: { marks?: { type: string }[] }[] }[])[0]
      ?.content?.[0]?.marks;
    expect(marks?.[0]?.type).toBe("strike");

    editor.commands.setContent(fromMarkdown("text"), { emitUpdate: false });
    applyToAll(editor, () => editor.chain().focus().toggleCode().run());
    marks = (editor.getJSON().content as { content?: { marks?: { type: string }[] }[] }[])[0]
      ?.content?.[0]?.marks;
    expect(marks?.[0]?.type).toBe("code");
  });

  it("undoes and redoes a formatting change", () => {
    editor.commands.setContent(fromMarkdown("text"), { emitUpdate: false });
    applyToAll(editor, () => editor.chain().focus().toggleBold().run());
    expect(editor.can().undo()).toBe(true);

    editor.chain().focus().undo().run();
    const afterUndo = (editor.getJSON().content as { content?: { marks?: unknown[] }[] }[])[0]
      ?.content?.[0]?.marks;
    expect(afterUndo ?? []).toHaveLength(0);

    editor.chain().focus().redo().run();
    const afterRedo = (editor.getJSON().content as { content?: { marks?: unknown[] }[] }[])[0]
      ?.content?.[0]?.marks;
    expect(afterRedo).toHaveLength(1);
  });
});

describe("editor <-> markdown", () => {
  it("serialises a document built by the editor", () => {
    const editor = makeEditor("## Heading\n\nSome **bold** text.");
    const markdown = toMarkdown(editor.getJSON());

    expect(markdown).toContain("## Heading");
    expect(markdown).toContain("**bold**");

    const text = docToText(editor.getJSON());
    expect(text).toContain("Heading");
    expect(text).toContain("Some bold text.");

    editor.destroy();
  });

  it("round-trips a document the editor produced", () => {
    const original = "1. first\n2. second\n\n> quote";
    const editor = makeEditor(original);
    const first = toMarkdown(editor.getJSON());
    const second = toMarkdown(fromMarkdown(first));

    expect(second).toBe(first);
    editor.destroy();
  });
});
