"use client";

import { useState } from "react";
import { Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTitleResolver } from "./useWikiLink";
import { wikiLink } from "@/lib/links/wiki";
import type { Editor } from "@tiptap/react";
import type { NoteId } from "@/lib/db/types";

/**
 * Pick a note to link to.
 *
 * Inserts `[[Title]]` at the cursor. Plain text on purpose: the link survives a
 * Markdown round trip, a ZIP backup and an HTML export with no resolver on the
 * other end, and renaming the target does not break it.
 */
export function LinkNoteDialog({
  editor,
  open,
  onOpenChange,
  excludeNoteId,
}: {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The note being edited, so a note cannot link to itself. */
  excludeNoteId?: NoteId;
}) {
  const { titles, idFor } = useTitleResolver();
  const [query, setQuery] = useState("");

  const matches = titles
    // Excluded by id, resolved from the title. Comparing the title against the
    // id never matches, which silently listed the note being edited in its own
    // link picker.
    .filter((title) => idFor(title) !== excludeNoteId)
    .filter((title) => title.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 40);

  const insert = (title: string) => {
    if (editor === null) return;
    // A leading space keeps the link from fusing onto the previous word, and a
    // trailing one leaves the cursor somewhere writable.
    editor
      .chain()
      .focus()
      .insertContent(` ${wikiLink(title)} `)
      .run();
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link to a note</DialogTitle>
          <DialogDescription>
            Inserts a <code className="font-mono">[[link]]</code> you can follow either way.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            autoFocus
            placeholder="Search notes…"
            aria-label="Search notes to link"
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter links the top match, so the common case is one keystroke.
              if (event.key === "Enter" && matches[0] !== undefined) {
                event.preventDefault();
                insert(matches[0]);
              }
            }}
          />
        </div>

        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {query.trim() === ""
                ? "No titled notes yet."
                : "No note matches that. You can still type the link by hand."}
            </p>
          ) : (
            matches.map((title) => (
              <Button
                key={title}
                variant="ghost"
                className="h-auto w-full justify-start gap-2 px-2 py-2 text-left"
                onClick={() => insert(title)}
              >
                <Link2 className="size-3.5 shrink-0 opacity-60" />
                <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
