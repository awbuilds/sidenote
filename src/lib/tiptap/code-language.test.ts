import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { buildExtensions } from "./extensions";
import { CODE_LANGUAGES, languageLabel } from "@/components/editor/CodeLanguagePicker";
import { fromMarkdown, toMarkdown } from "./markdown";

/**
 * The language is only worth offering if it survives. A selector that sets an
 * attribute the Markdown writer drops would look right and quietly lose the
 * value on export, so the round trip is asserted here.
 */
function editor(): Editor {
  return new Editor({
    extensions: buildExtensions(),
    content: { type: "doc", content: [{ type: "paragraph" }] },
    element: document.createElement("div"),
  });
}

function withCode(instance: Editor, code: string): void {
  instance.chain().focus().toggleCodeBlock().run();
  instance.commands.insertContent(code);
}

describe("code block language", () => {
  it("defaults to no language", () => {
    const instance = editor();
    expect(instance.getAttributes("codeBlock").language ?? "").toBe("");
    instance.destroy();
  });

  it("stores the language on the block", () => {
    const instance = editor();
    withCode(instance, "const a = 1;");
    instance.commands.updateAttributes("codeBlock", { language: "typescript" });
    expect(instance.getAttributes("codeBlock").language).toBe("typescript");
    instance.destroy();
  });

  it("writes a fenced block with the language", () => {
    const instance = editor();
    withCode(instance, "const a = 1;");
    instance.commands.updateAttributes("codeBlock", { language: "typescript" });

    const markdown = toMarkdown(instance.getJSON());
    expect(markdown).toContain("```typescript");
    expect(markdown).toContain("const a = 1;");
    instance.destroy();
  });

  it("reads the language back from Markdown", () => {
    const reparsed = fromMarkdown("```python\nprint(1)\n```");
    const block = reparsed.content?.[0];
    expect(block?.type).toBe("codeBlock");
    expect(block?.attrs?.language).toBe("python");
  });

  it("survives a full round trip unchanged", () => {
    const instance = editor();
    withCode(instance, "SELECT 1;");
    instance.commands.updateAttributes("codeBlock", { language: "sql" });

    const reparsed = fromMarkdown(toMarkdown(instance.getJSON()));
    expect(reparsed.content?.[0]?.attrs?.language).toBe("sql");
    instance.destroy();
  });

  it("leaves the code content untouched when the language changes", () => {
    const instance = editor();
    withCode(instance, "print(1)");
    instance.commands.updateAttributes("codeBlock", { language: "python" });
    expect(instance.getText()).toContain("print(1)");
    instance.destroy();
  });

  it("clears the language when plain text is chosen", () => {
    const instance = editor();
    withCode(instance, "just words");
    instance.commands.updateAttributes("codeBlock", { language: "python" });
    instance.commands.updateAttributes("codeBlock", { language: "" });

    expect(instance.getAttributes("codeBlock").language).toBe("");
    // And the export is an unlabelled fence, not "```".
    expect(toMarkdown(instance.getJSON())).not.toContain("```python");
    instance.destroy();
  });

  it("writes no language for an unlabelled fence", () => {
    const instance = editor();
    withCode(instance, "plain");
    expect(toMarkdown(instance.getJSON())).toContain("```\n");
    instance.destroy();
  });
});

describe("languageLabel", () => {
  it("names a known language", () => {
    expect(languageLabel("typescript")).toBe("TypeScript");
  });

  it("calls an empty language plain text", () => {
    expect(languageLabel("")).toBe("Plain text");
  });

  it("passes an unknown language through rather than hiding it", () => {
    // A document can arrive from an import with any language; showing the raw
    // id is honest, showing nothing is not.
    expect(languageLabel("brainfuck")).toBe("brainfuck");
  });

  it("has no duplicate ids", () => {
    const ids = CODE_LANGUAGES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate labels", () => {
    const labels = CODE_LANGUAGES.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
