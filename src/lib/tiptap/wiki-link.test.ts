import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { buildExtensions } from "./extensions";
import { WikiLink, wikiLinkTitleFrom } from "./wiki-link";
import { fromMarkdown } from "./markdown";

/**
 * A decoration is a document range. If that range is off by one the link
 * underlines the wrong characters — which looks fine in a screenshot and is
 * invisible in every other test, so the exact covered text is asserted here.
 */

function makeEditor(body: string, resolved: (title: string) => boolean = () => true): Editor {
  return new Editor({
    extensions: [...buildExtensions(), WikiLink.configure({ resolved })],
    content: fromMarkdown(body),
    element: document.createElement("div"),
  });
}

/** The exact text each decoration covers, read back out of the DOM. */
function decoratedText(editor: Editor): string[] {
  const spans = editor.view.dom.querySelectorAll("[data-wiki-title]");
  return [...spans].map((span) => span.textContent ?? "");
}

function titles(editor: Editor): string[] {
  return [...editor.view.dom.querySelectorAll("[data-wiki-title]")].map(
    (span) => span.getAttribute("data-wiki-title") ?? "",
  );
}

describe("wiki link decorations", () => {
  it("decorates a link and covers exactly its text", () => {
    const editor = makeEditor("see [[Roof]] above");
    // jsdom does not lay out, but decorations are still reflected in the DOM.
    expect(decoratedText(editor)).toContain("[[Roof]]");
    editor.destroy();
  });

  it("reads the title off the link, not the whole match", () => {
    const editor = makeEditor("see [[Long Title|short]] here");
    expect(titles(editor)).toEqual(["Long Title"]);
    editor.destroy();
  });

  it("marks a link with no matching note as unresolved", () => {
    const editor = makeEditor("[[Ghost]]", () => false);
    const span = editor.view.dom.querySelector("[data-wiki-title]");
    expect(span?.className).toContain("wiki-link-unresolved");
    editor.destroy();
  });

  it("leaves a resolved link unmarked", () => {
    const editor = makeEditor("[[Roof]]", () => true);
    const span = editor.view.dom.querySelector("[data-wiki-title]");
    expect(span?.className).toContain("wiki-link");
    expect(span?.className).not.toContain("unresolved");
    editor.destroy();
  });

  it("decorates every link in the document", () => {
    const editor = makeEditor("[[One]] then [[Two]] then [[Three]]");
    expect(titles(editor)).toEqual(["One", "Two", "Three"]);
    editor.destroy();
  });

  it("decorates links inside list items and quotes", () => {
    const editor = makeEditor("- item with [[A]]\n\n> quoted [[B]]");
    expect(titles(editor)).toEqual(["A", "B"]);
    editor.destroy();
  });

  it("decorates each link in its own text node", () => {
    // A shared regex would carry lastIndex across nodes and skip the second.
    const editor = makeEditor("[[First]]\n\n[[Second]]");
    expect(titles(editor)).toEqual(["First", "Second"]);
    editor.destroy();
  });

  it("decorates a document with no links without complaint", () => {
    const editor = makeEditor("just prose");
    expect(titles(editor)).toEqual([]);
    editor.destroy();
  });

  it("ignores a link naming nothing", () => {
    const editor = makeEditor("[[]] and [[|alias]]");
    expect(titles(editor)).toEqual([]);
    editor.destroy();
  });

  it("picks up a link typed after load", () => {
    const editor = makeEditor("start");
    expect(titles(editor)).toEqual([]);

    editor.commands.insertContent(" and [[New]]");
    expect(titles(editor)).toEqual(["New"]);
    editor.destroy();
  });

  it("re-resolves when the document changes", () => {
    let known = false;
    const editor = makeEditor("[[Roof]]", () => known);
    expect(
      editor.view.dom.querySelector("[data-wiki-title]")?.className,
    ).toContain("unresolved");

    // The target note now exists. Resolution is re-evaluated on the next
    // document change — there is deliberately no transaction to force it,
    // because dispatching one from an effect is what crashed note opens.
    known = true;
    editor.commands.insertContent(" ");

    expect(
      editor.view.dom.querySelector("[data-wiki-title]")?.className,
    ).not.toContain("unresolved");
    editor.destroy();
  });

  it("leaves the document untouched while re-resolving", () => {
    let known = false;
    const editor = makeEditor("[[Roof]]", () => known);
    known = true;
    editor.commands.insertContent(" ");
    // The link is still plain text in the document — re-resolving is a
    // decoration concern and must not rewrite the note.
    expect(JSON.stringify(editor.getJSON())).toContain("[[Roof]]");
    expect(editor.getText().trim()).toBe("[[Roof]]");
    editor.destroy();
  });

  it("reads the title off whatever was clicked", () => {
    const span = document.createElement("span");
    span.setAttribute("data-wiki-title", "Roof");
    const child = document.createElement("em");
    child.textContent = "clicked the middle";
    span.append(child);

    expect(wikiLinkTitleFrom(child)).toBe("Roof");
    expect(wikiLinkTitleFrom(span)).toBe("Roof");
  });

  it("returns null for a click that missed every link", () => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "no link here";
    expect(wikiLinkTitleFrom(paragraph)).toBeNull();
    expect(wikiLinkTitleFrom(null)).toBeNull();
  });

  it("leaves the document text untouched — the link is plain text", () => {
    const editor = makeEditor("see [[Roof]] above");
    // No wikiLink node in the doc: the text is what gets stored and exported.
    expect(JSON.stringify(editor.getJSON())).not.toContain("wikiLink");
    expect(JSON.stringify(editor.getJSON())).toContain("[[Roof]]");
    editor.destroy();
  });
});
