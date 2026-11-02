"use client";

import { ArrowUpRight, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBacklinks, useOutgoingLinks } from "@/hooks/queries";
import { pluralize } from "@/lib/format";
import type { NoteId } from "@/lib/db/types";

/**
 * Linked notes panel.
 *
 * Shows both directions, because both are what you need while writing: what
 * this note points at, and what points back. Unresolved outgoing links are
 * listed by name rather than hidden — an unresolved link is a note the author
 * intended to write, and hiding it would make the feature feel broken.
 */
export function BacklinksPanel({
  noteId,
  onOpenNote,
}: {
  noteId: NoteId;
  onOpenNote: (id: NoteId) => void;
}) {
  const backlinks = useBacklinks(noteId);
  const outgoing = useOutgoingLinks(noteId);

  const back = backlinks.data ?? [];
  const links = outgoing.data ?? [];
  const unresolved = links.filter((link) => link.targetId === null);

  if (back.length === 0 && links.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <Link2Off className="size-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          No links yet. Type{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">[[Note title]]</code>{" "}
          to link to another note.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      {links.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Links to
          </h3>
          <ul className="space-y-0.5">
            {links.map((link) =>
              link.targetId === null ? (
                <li
                  key={link.id}
                  className="truncate rounded px-2 py-1.5 text-xs text-muted-foreground"
                  title="No note with this title yet"
                >
                  <span className="mr-1.5 text-muted-foreground/60">○</span>
                  {link.targetTitle}
                </li>
              ) : (
                <li key={link.id}>
                  <LinkRow
                    title={link.targetTitle}
                    onClick={() => onOpenNote(link.targetId as NoteId)}
                  />
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {back.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Linked from
          </h3>
          <ul className="space-y-0.5">
            {back.map((note) => (
              <li key={note.id}>
                <LinkRow
                  title={note.title === "" ? "Untitled" : note.title}
                  onClick={() => onOpenNote(note.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {unresolved.length > 0 && (
        <p className="border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
          {pluralize(unresolved.length, "link")} point at{" "}
          {unresolved.length === 1 ? "a note that does" : "notes that do"} not exist yet.
          Create {unresolved.length === 1 ? "it" : "them"} and the link resolves itself.
        </p>
      )}
    </div>
  );
}

function LinkRow({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      className="h-auto w-full justify-start gap-1.5 px-2 py-1.5 text-left text-xs font-normal"
      onClick={onClick}
    >
      <Link2 className="size-3 shrink-0 opacity-60" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <ArrowUpRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </Button>
  );
}
