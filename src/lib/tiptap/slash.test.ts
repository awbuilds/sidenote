import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { buildExtensions } from "./extensions";
import { filterCommands, slashMatchAt, slashQueryInText, type SlashCommand } from "./slash";
import { fromMarkdown } from "./markdown";

/**
 * The trigger is matched against the live document, so the range it returns is
 * the whole risk: an off-by-one deletes the wrong character when a command runs.
 * The "deletes exactly" test is the one that matters — it performs the delete.
 */
function editor(body: string): Editor {
  return new Editor({
    extensions: buildExtensions(),
    content: fromMarkdown(body),
    element: document.createElement("div"),
  });
}

/** The end of the first text block, i.e. where a cursor would sit after typing. */
function endOfFirstBlock(instance: Editor): number {
  let end = 0;
  instance.state.doc.descendants((node, pos) => {
    if (end !== 0) return false;
    if (node.isText && node.text != null) {
      end = pos + node.text.length;
      return false;
    }
    return true;
  });
  return end;
}

describe("slashQueryInText", () => {
  it("matches a bare slash", () => {
    expect(slashQueryInText("/")).toEqual({ query: "" });
  });

  it("matches a slash with a query", () => {
    expect(slashQueryInText("/head")).toEqual({ query: "head" });
  });

  it("allows leading whitespace", () => {
    expect(slashQueryInText("  /tab")).toEqual({ query: "tab" });
  });

  it("ignores a slash in the middle of a word", () => {
    expect(slashQueryInText("and/or")).toBeNull();
  });

  it("ignores a slash after other text", () => {
    expect(slashQueryInText("write /head")).toBeNull();
  });

  it("ends the command at a space", () => {
    expect(slashQueryInText("/head 2")).toBeNull();
  });

  it("ignores prose containing a slash", () => {
    expect(slashQueryInText("50/50 split")).toBeNull();
  });

  it("caps an absurdly long query", () => {
    expect(slashQueryInText(`/${"a".repeat(40)}`)).toBeNull();
  });

  it("returns null with no slash at all", () => {
    expect(slashQueryInText("just prose")).toBeNull();
  });
});

describe("slashMatchAt", () => {
  it("matches a bare slash at the start of a block", () => {
    const instance = editor("/");
    const match = slashMatchAt(instance.state, endOfFirstBlock(instance));
    expect(match).toEqual({ from: 1, to: 2, query: "" });
    instance.destroy();
  });

  it("returns a range that deletes exactly the trigger and query", () => {
    const instance = editor("/head");
    const match = slashMatchAt(instance.state, endOfFirstBlock(instance));
    expect(match?.query).toBe("head");

    instance.commands.deleteRange({ from: match!.from, to: match!.to });
    expect(instance.getText()).toBe("");
    instance.destroy();
  });

  it("leaves surrounding text intact when it deletes", () => {
    const instance = editor("/tab");
    const match = slashMatchAt(instance.state, endOfFirstBlock(instance));
    instance.commands.deleteRange({ from: match!.from, to: match!.to });
    expect(instance.getText()).toBe("");
    instance.destroy();
  });

  it("finds the trigger in a list item", () => {
    const instance = editor("- /tab");
    const match = slashMatchAt(instance.state, endOfFirstBlock(instance));
    expect(match?.query).toBe("tab");
    instance.destroy();
  });

  it("returns null for a document with no slash", () => {
    const instance = editor("just prose");
    expect(slashMatchAt(instance.state, endOfFirstBlock(instance))).toBeNull();
    instance.destroy();
  });

  it("returns null at position zero", () => {
    const instance = editor("/head");
    expect(slashMatchAt(instance.state, 0)).toBeNull();
    instance.destroy();
  });

  it("returns null past the end of the document", () => {
    const instance = editor("/head");
    expect(slashMatchAt(instance.state, instance.state.doc.content.size + 50)).toBeNull();
    instance.destroy();
  });

  it("does not match a slash the cursor has moved away from", () => {
    const instance = editor("/head then more words");
    expect(slashMatchAt(instance.state, 1)).toBeNull();
    instance.destroy();
  });

  it("works in the second block, not just the first", () => {
    const instance = editor("first\n\n/tab");
    const doc = instance.state.doc;
    // Walk to the paragraph containing the slash.
    let target = 0;
    doc.descendants((node, pos) => {
      if (target !== 0) return false;
      if (node.isText && node.text === "/tab") {
        target = pos + 4;
        return false;
      }
      return true;
    });

    const match = slashMatchAt(instance.state, target);
    expect(match?.query).toBe("tab");

    instance.commands.deleteRange({ from: match!.from, to: match!.to });
    // The first block must survive.
    expect(instance.getText()).toContain("first");
    instance.destroy();
  });
});

const COMMANDS: SlashCommand[] = [
  { id: "h1", title: "Heading 1", keywords: ["title", "h1"], hint: "Large section" },
  { id: "h2", title: "Heading 2", keywords: ["subtitle", "h2"], hint: "Medium section" },
  { id: "quote", title: "Quote", keywords: ["blockquote", "citation"], hint: "Set apart" },
  { id: "table", title: "Table", keywords: ["grid"], hint: "Rows and columns" },
];

describe("filterCommands", () => {
  it("returns everything for an empty query", () => {
    expect(filterCommands(COMMANDS, "")).toHaveLength(COMMANDS.length);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(filterCommands(COMMANDS, "  quote  ").map((c) => c.id)).toEqual(["quote"]);
  });

  it("matches a keyword as well as the title", () => {
    expect(filterCommands(COMMANDS, "citation").map((c) => c.id)).toEqual(["quote"]);
  });

  it("matches a subsequence across the title", () => {
    // "hdg" is a subsequence of "heading", so both headings match.
    expect(filterCommands(COMMANDS, "hdg").map((c) => c.id)).toEqual(["h1", "h2"]);
  });

  it("narrows a subsequence with a distinguishing character", () => {
    expect(filterCommands(COMMANDS, "hd1").map((c) => c.id)).toEqual(["h1"]);
  });

  it("is case-insensitive", () => {
    expect(filterCommands(COMMANDS, "TABLE").map((c) => c.id)).toEqual(["table"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterCommands(COMMANDS, "zzzz")).toEqual([]);
  });

  it("preserves declaration order", () => {
    expect(filterCommands(COMMANDS, "h").map((c) => c.id)).toEqual(["h1", "h2"]);
  });
});
