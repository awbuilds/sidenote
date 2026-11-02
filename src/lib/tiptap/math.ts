import type { Editor } from "@tiptap/react";

/**
 * Insert a display equation.
 *
 * TipTap's mathematics extension ships block and inline node types; this only
 * wraps the command so the toolbar and any future slash command share one
 * definition of "insert an equation".
 */
export function insertMathBlock(editor: Editor, latex: string): void {
  const trimmed = latex.trim();
  if (trimmed === "") return;

  editor
    .chain()
    .focus()
    .insertInlineMath({ latex: trimmed })
    .run();
}