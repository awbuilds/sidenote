import type { JSONContent } from "@tiptap/core";

/**
 * Document outline.
 *
 * Derived from the document on every change — there is no separate structure to
 * keep in sync, which is the same reason `contentJson` is the source of truth
 * for everything else. A stored outline would drift the first time someone
 * edited a heading.
 */

export interface OutlineNode {
  id: string;
  level: number;
  text: string;
  /** Document position, for scroll-to. */
  pos: number;
  children: OutlineNode[];
}

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.content === undefined) return "";
  return node.content.map(textOf).join("");
}

/** Flat list of every heading, in document order. */
export function collectHeadings(doc: JSONContent): Omit<OutlineNode, "children">[] {
  const found: Omit<OutlineNode, "children">[] = [];

  const walk = (node: JSONContent) => {
    if (typeof node.type === "string" && node.type === "heading") {
      const level = Number(node.attrs?.level ?? 1);
      found.push({
        id: `h-${found.length}-${level}`,
        level: Number.isFinite(level) ? level : 1,
        text: textOf(node).trim(),
        pos: 0,
      });
    }
    node.content?.forEach(walk);
  };

  walk(doc);
  return found;
}

/**
 * Nest a flat heading list by level, the way a document's visual hierarchy
 * implies. A heading that jumps two levels (h1 -> h3) is attached to the
 * nearest shallower ancestor rather than being orphaned.
 */
export function nestHeadings(
  flat: Omit<OutlineNode, "children">[],
): OutlineNode[] {
  const roots: OutlineNode[] = [];
  // Stack of the open nodes, one per level.
  const stack: OutlineNode[] = [];

  for (const heading of flat) {
    const node: OutlineNode = { ...heading, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);

    stack.push(node);
  }

  return roots;
}

export function outlineFromDoc(doc: JSONContent): OutlineNode[] {
  return nestHeadings(collectHeadings(doc));
}

/** Flatten for rendering, returning each node's depth. */
export function flattenOutline(
  nodes: OutlineNode[],
): { node: OutlineNode; depth: number }[] {
  const out: { node: OutlineNode; depth: number }[] = [];
  const walk = (list: OutlineNode[], depth: number) => {
    for (const node of list) {
      out.push({ node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

/** Word and character counts, for the editor's status line. */
export function countText(doc: JSONContent): {
  words: number;
  characters: number;
  blocks: number;
} {
  const text = textOf(doc).trim();
  return {
    words: text === "" ? 0 : text.split(/\s+/).filter(Boolean).length,
    characters: text.length,
    blocks: (doc.content ?? []).filter((node) => !isEmptyNode(node)).length,
  };
}

function isEmptyNode(node: JSONContent): boolean {
  if (node.type === "paragraph" || node.type === "heading") {
    return node.content === undefined || textOf(node).trim() === "";
  }
  return false;
}
