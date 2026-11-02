import { describe, expect, it } from "vitest";
import { withTestDb } from "@/lib/db/test-helpers";
import { createNote, saveNoteContent } from "@/lib/db/repositories/notes";
import { addAttachment } from "@/lib/db/repositories/attachments";
import { attachmentRef } from "@/lib/attachments/urls";
import { fromMarkdown } from "@/lib/tiptap/markdown";
import { buildStandaloneHtml, escapeHtml, slugify } from "./export-note";

/**
 * The standalone HTML file is the only way to hand a note to someone else
 * without a server, so it has to work with no network, no stylesheet and no
 * sibling folder.
 */
withTestDb();

describe("slugify", () => {
  it("produces a safe filename", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
    expect(slugify("  Spaced  out  ")).toBe("spaced-out");
  });

  it("falls back to a default rather than an empty name", () => {
    expect(slugify("")).toBe("note");
    expect(slugify("!!!")).toBe("note");
  });

  it("caps the length", () => {
    expect(slugify("a".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("escapeHtml", () => {
  it("escapes every dangerous character", () => {
    expect(escapeHtml(`<script>alert("x")&'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;",
    );
  });
});

describe("buildStandaloneHtml", () => {
  it("produces a complete, self-contained document", async () => {
    const created = await createNote({ title: "My note" });
    // `saveNoteContent` returns the updated note; the object from `createNote`
    // is a snapshot with an empty body and goes stale the moment we save.
    const note = await saveNoteContent(created.id, {
      contentJson: fromMarkdown("## Section\n\nSome **bold** text."),
      contentMarkdown: "## Section\n\nSome **bold** text.",
      contentText: "Section\nSome bold text.",
    });

    const { html } = await buildStandaloneHtml(note);

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).toContain("My note");
    expect(html).toContain("<strong>bold</strong>");
    // No external references of any kind.
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    expect(html).not.toMatch(/src="http/);
    expect(html).not.toMatch(/attachment:\/\//);
  });

  it("embeds attachment images as base64 data URIs", async () => {
    const note = await createNote({ title: "With image" });
    const attachment = await addAttachment({
      noteId: note.id,
      fileName: "pixel.png",
      mime: "image/png",
      // The literal bytes for a 1x1 transparent PNG.
      blob: new Blob(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])],
        { type: "image/png" },
      ),
    });

    const content = fromMarkdown("Before");
    content.content?.push({
      type: "image",
      attrs: { src: attachmentRef(attachment.id) },
    } as never);
    const saved = await saveNoteContent(note.id, {
      contentJson: content,
      contentMarkdown: "Before",
      contentText: "Before",
    });

    const { html, missing } = await buildStandaloneHtml(saved);

    expect(missing).toEqual([]);
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain(attachmentRef(attachment.id));
  });

  it("replaces a missing attachment with a visible marker and reports it", async () => {
    const note = await createNote({ title: "Broken" });
    const content = fromMarkdown("Text");
    content.content?.push({
      type: "image",
      attrs: { src: attachmentRef("gone") },
    } as never);

    const saved = await saveNoteContent(note.id, {
      contentJson: content,
      contentMarkdown: "Text",
      contentText: "Text",
    });

    const { html, missing } = await buildStandaloneHtml(saved);

    expect(missing).toEqual(["gone"]);
    expect(html).toContain("missing image");
  });

  it("escapes a title containing markup", async () => {
    const note = await createNote({ title: '<script>alert("x")</script>' });
    const { html } = await buildStandaloneHtml(note);

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses a placeholder title for an untitled note", async () => {
    const note = await createNote({ title: "   " });
    const { html } = await buildStandaloneHtml(note);
    expect(html).toContain("Untitled note");
  });

  it("keeps task lists as checkboxes, not bullets", async () => {
    const note = await createNote({ title: "Tasks" });
    const saved = await saveNoteContent(note.id, {
      contentJson: fromMarkdown("- [ ] one\n- [x] two"),
      contentMarkdown: "- [ ] one\n- [x] two",
      contentText: "one two",
    });

    const { html } = await buildStandaloneHtml(saved);
    expect(html).toContain('type="checkbox"');
  });
});
