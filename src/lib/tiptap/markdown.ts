import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { buildExtensions } from "./extensions";

/**
 * Markdown serialisation, backed by TipTap's own manager.
 *
 * A standalone manager (rather than the editor instance) means the same code
 * path is exercised in tests without a DOM, and the Markdown view and the
 * autosave path cannot drift apart — both go through here.
 */

let cached: MarkdownManager | null = null;

export function markdownManager(): MarkdownManager {
  if (cached === null) {
    cached = new MarkdownManager({ extensions: buildExtensions() });
  }
  return cached;
}

export function toMarkdown(doc: JSONContent): string {
  try {
    return markdownManager().serialize(doc);
  } catch {
    // A malformed document must not break saving. Callers treat "" as "no
    // markdown available" rather than losing the JSON, which is authoritative.
    return "";
  }
}

export function fromMarkdown(markdown: string): JSONContent {
  return markdownManager().parse(markdown);
}

export { docToText, isEmptyDoc } from "./doc";
