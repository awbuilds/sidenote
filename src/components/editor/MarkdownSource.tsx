"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toMarkdown } from "@/lib/tiptap/markdown";
import type { JSONContent } from "@tiptap/core";

/**
 * Raw Markdown view.
 *
 * Markdown is derived from `contentJson`; this is an *edit surface* over the
 * same document, not a separate representation. Edits are handed back as
 * Markdown for the parent to parse into the document, so the source of truth
 * never splits.
 *
 * The text is seeded from the document on mount and then owned by the user.
 * The parent remounts this with a key when the note or tab changes, so there
 * is no effect syncing the two and no chance of the textarea stomping on text
 * mid-typing.
 */
export function MarkdownSource({
  doc,
  onChange,
}: {
  doc: JSONContent;
  onChange: (markdown: string) => void;
}) {
  const [text, setText] = useState(() => toMarkdown(doc));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-6 py-1.5">
        <p className="text-xs text-muted-foreground">
          Markdown source. The rich editor and this view edit the same document.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            const regenerated = toMarkdown(doc);
            setText(regenerated);
            onChange(regenerated);
          }}
        >
          Reset from editor
        </Button>
      </div>
      <Textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(event.target.value);
        }}
        spellCheck={false}
        aria-label="Markdown source"
        className="min-h-0 flex-1 resize-none rounded-none border-0 p-6 font-mono text-sm leading-relaxed focus-visible:ring-0"
      />
    </div>
  );
}
