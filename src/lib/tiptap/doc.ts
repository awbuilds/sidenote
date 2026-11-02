import type { JSONContent } from "@tiptap/core";

/**
 * Flatten a document to plain text, for search indexing and list previews.
 *
 * Deliberately dependency-free: the seed uses this at first run, and importing
 * the Markdown manager there would drag the entire editor into the initial
 * bundle for no benefit.
 *
 * Text-block children (paragraph, heading, listItem) are joined with "" not
 * " " — they are contiguous runs from a single sentence, and joining with a
 * space injects whitespace that was never in the document
 * ("Some " + "bold" -> "Some  bold").
 */
export function docToText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";

  const parts = node.content.map(docToText).filter((part) => part !== "");

  if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") {
    return parts.join("");
  }
  return parts.join("\n");
}

/** True when a document has no meaningful content. */
export function isEmptyDoc(doc: JSONContent): boolean {
  if (!doc.content || doc.content.length === 0) return true;
  return doc.content.every(
    (node) =>
      node.type === "paragraph" &&
      (!node.content ||
        node.content.length === 0 ||
        node.content.every((child) => !(child as { text?: string }).text)),
  );
}
