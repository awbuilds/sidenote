import type { JSONContent } from "@tiptap/core";
import { generateHTML } from "@tiptap/html";
import { buildExtensions } from "@/lib/tiptap/extensions";

const ATTACHMENT_PREFIX = "attachment://";

/**
 * Attachments live in the browser (`attachment://<id>`), and their bytes are
 * not on the server until attachment sync lands. Replace them with an honest
 * placeholder instead of emitting a broken `attachment://` image to visitors.
 */
export function withoutLocalImages(node: JSONContent): JSONContent {
  const src = typeof node.attrs?.src === "string" ? node.attrs.src : null;
  if (node.type === "image" && src !== null && src.startsWith(ATTACHMENT_PREFIX)) {
    return {
      type: "paragraph",
      content: [{ type: "text", text: "📎 Image not included in shared links yet" }],
    };
  }
  if (!node.content) return node;
  return { ...node, content: node.content.map(withoutLocalImages) };
}

export function renderSharedHtml(content: JSONContent): string {
  try {
    return generateHTML(withoutLocalImages(content), buildExtensions());
  } catch {
    return "<p>This note could not be displayed.</p>";
  }
}
