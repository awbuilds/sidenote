import { db } from "@/lib/db/db";
import { buildExtensions } from "@/lib/tiptap/extensions";
import { generateHTML } from "@tiptap/html";
import { formatDateTime } from "@/lib/format";
import { isAttachmentRef, parseAttachmentRef } from "@/lib/attachments/urls";
import type { JSONContent } from "@tiptap/core";
import type { Note } from "@/lib/db/types";

/**
 * Single-note export: Markdown, and a self-contained HTML file.
 *
 * The HTML is the interim substitute for public share links, which need a
 * server. For it to actually be shareable it must not depend on anything
 * external — no stylesheet, no image URL — so styles are inlined and
 * `attachment://` image references are resolved to base64 data URIs.
 */

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick; revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadTextFile(
  fileName: string,
  contents: string,
  mime = "text/plain",
): void {
  downloadBlob(new Blob([contents], { type: `${mime};charset=utf-8` }), fileName);
}

export function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "note"
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STANDALONE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0 auto; padding: 48px 24px; max-width: 46rem;
  font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #18181b; background: #fff;
}
h1, h2, h3, h4 { line-height: 1.25; margin: 1.6em 0 .6em; }
h1 { font-size: 1.9em; } h2 { font-size: 1.45em; } h3 { font-size: 1.2em; }
p, ul, ol, blockquote, pre { margin: 0 0 1em; }
a { color: #2563eb; }
code { background: #f4f4f5; padding: .15em .35em; border-radius: .25em; font-size: .9em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background: #f4f4f5; padding: 1em; border-radius: .5rem; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #d4d4d8; margin-left: 0; padding-left: 1em; color: #52525b; }
ul[data-type="taskList"] { list-style: none; padding-left: 1.1em; }
li { margin: .2em 0; }
img { max-width: 100%; height: auto; border-radius: .375rem; }
hr { border: none; border-top: 1px solid #e4e4e7; margin: 2em 0; }
.meta { color: #71717a; font-size: .85em; margin-bottom: 2em;
  padding-bottom: 1em; border-bottom: 1px solid #e4e4e7; }
@media (prefers-color-scheme: dark) {
  body { color: #e4e4e7; background: #101012; }
  code, pre { background: #27272a; }
  blockquote { border-color: #3f3f46; color: #a1a1aa; }
  hr, .meta { border-color: #27272a; }
  a { color: #60a5fa; }
}
@media print { body { max-width: none; padding: 0; } }
`;

/** Base64 from bytes, without assuming a browser-specific `btoa` on binary. */
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

export interface ShareBuildResult {
  html: string;
  /** Attachments that could not be embedded, by file name. */
  missing: string[];
}

/**
 * Build a standalone HTML document for a note.
 *
 * Any `attachment://<id>` image is inlined as a data URI so the file works
 * with no network and no sibling folder. If an attachment is missing from
 * storage the image is replaced with a visible marker rather than a broken
 * icon, and the name is reported so the caller can tell the user.
 */
export async function buildStandaloneHtml(note: Note): Promise<ShareBuildResult> {
  const missing: string[] = [];
  const attachments = await db().attachments.where("noteId").equals(note.id).toArray();
  const byId = new Map(attachments.map((row) => [row.id, row]));

  /** Replace every attachment reference in the document. */
  const inline = (node: JSONContent): JSONContent => {
    const src = node.attrs?.src;
    if (typeof src !== "string" || !isAttachmentRef(src)) return node;

    const id = parseAttachmentRef(src);
    const attachment = id === null ? undefined : byId.get(id);
    if (attachment === undefined) {
      missing.push(id ?? src);
      return { type: "paragraph", content: [{ type: "text", text: "[missing image]" }] };
    }

    return {
      ...node,
      attrs: {
        ...node.attrs,
        src: `data:${attachment.mime};base64,${bytesToBase64(attachment.data)}`,
      },
    };
  };

  const walk = (node: JSONContent): JSONContent => {
    const replaced = inline(node);
    if (replaced.content === undefined) return replaced;
    return { ...replaced, content: replaced.content.map(walk) };
  };

  const inlined = walk(note.contentJson);

  let body: string;
  try {
    body = generateHTML(inlined, buildExtensions());
  } catch {
    // Never let an unusual document stop the export.
    body = `<pre>${escapeHtml(note.contentText)}</pre>`;
  }

  const title = note.title.trim() === "" ? "Untitled note" : note.title;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STANDALONE_CSS}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Updated ${escapeHtml(formatDateTime(note.updatedAt))}</p>
${body}
</body>
</html>`;

  return { html, missing };
}

export async function exportNoteAsHtml(note: Note): Promise<ShareBuildResult> {
  const { html, missing } = await buildStandaloneHtml(note);
  downloadBlob(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    `${slugify(note.title)}.html`,
  );
  return { html, missing };
}

/**
 * Share through the OS share sheet where available. Falls back to a download.
 * Note the size caveat: a note with many photos produces a large file, because
 * every image is embedded.
 */
export async function shareNote(note: Note): Promise<"shared" | "downloaded" | "unavailable"> {
  const { html, missing } = await buildStandaloneHtml(note);
  const fileName = `${slugify(note.title)}.html`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });

  if (typeof navigator !== "undefined" && typeof navigator.canShare === "function") {
    const file = new File([blob], fileName, { type: "text/html" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: note.title || fileName });
        return "shared";
      } catch (error) {
        // AbortError means the user dismissed the sheet; not a failure.
        if (error instanceof Error && error.name === "AbortError") return "shared";
      }
    }
  }

  downloadBlob(blob, fileName);
  void missing;
  return "downloaded";
}
