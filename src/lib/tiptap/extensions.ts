"use client";

import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Mathematics } from "@tiptap/extension-mathematics";
import { Markdown } from "@tiptap/markdown";
import type { AnyExtension } from "@tiptap/core";
import { AttachmentImage } from "./attachment-image";

/**
 * The editor's extension set — the single definition used by the editor, the
 * Markdown view, and the standalone `MarkdownManager` used in tests.
 *
 * StarterKit already ships Link, Underline **and HorizontalRule**, so those
 * are configured here rather than added separately — registering a duplicate
 * name produces a `[tiptap warn]: Duplicate extension names` warning and can
 * lead to schema issues. Check StarterKit's bundled list before adding
 * anything here.
 *
 * `AttachmentImage` extends Image with a node view that resolves
 * `attachment://<id>` to a reference-counted object URL. It is a `.tsx`
 * module, so it is not used by the non-React `MarkdownManager` path — see
 * `buildHeadlessExtensions` below, which the tests and Markdown serialisation
 * use.
 */
export function buildExtensions(options: { placeholder?: string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      },
      codeBlock: { HTMLAttributes: { class: "code-block" } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    AttachmentImage.configure({
      // Images are addressed by attachment id, not URL — see AttachmentImage.
      inline: false,
      allowBase64: true,
    }),
    Table.configure({
      resizable: true,
      allowTableNodeSelection: true,
      // Rows need headerRow/col cells to survive a round trip through
      // Markdown, where a table becomes a GFM pipe table.
      HTMLAttributes: { class: "note-table" },
    }),
    TableRow,
    TableHeader,
    TableCell,
    Mathematics.configure({
      katexOptions: { throwOnError: false, output: "htmlAndMathml" },
    }),
    Placeholder.configure({ placeholder: options.placeholder ?? "Start writing…" }),
    Markdown.configure({ markedOptions: { gfm: true, breaks: false } }),
  ];
}
