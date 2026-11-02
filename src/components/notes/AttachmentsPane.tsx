"use client";

import { useMemo, useState } from "react";
import { FileImage, HardDrive, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAttachments } from "@/hooks/queries";
import { pluralize } from "@/lib/format";
import { formatBytes } from "@/lib/storage/quota";
import type { NoteId } from "@/lib/db/types";

/**
 * Every image in the workspace.
 *
 * The paperclip in the reference's rail opens a view like this. It exists
 * because there is no other way to answer "which note has that picture in it"
 * once the workspace has more than a handful of notes — the alternative is
 * opening each one and scrolling.
 *
 * Metadata only. The bytes are not loaded to draw a list of filenames, and
 * opening an image means navigating to its note rather than decoding a blob
 * here, which keeps this view cheap no matter how much is stored.
 */
export function AttachmentsPane({
  onOpenNote,
}: {
  onOpenNote: (id: NoteId) => void;
}) {
  const { data: attachments, isPending } = useAttachments();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const all = attachments ?? [];
    const needle = query.trim().toLowerCase();
    if (needle === "") return all;
    return all.filter(
      (attachment) =>
        attachment.fileName.toLowerCase().includes(needle) ||
        attachment.noteTitle.toLowerCase().includes(needle),
    );
  }, [attachments, query]);

  const totalBytes = useMemo(
    () => (attachments ?? []).reduce((sum, attachment) => sum + attachment.size, 0),
    [attachments],
  );

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Loading attachments…
      </div>
    );
  }

  if ((attachments?.length ?? 0) === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Paperclip className="size-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          No images yet. Paste or drop one into any note and it appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b p-2">
        <Input
          value={query}
          placeholder="Search images…"
          aria-label="Search attachments"
          className="h-8"
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <HardDrive className="size-3" />
          {pluralize(rows.length, "image")} · {formatBytes(totalBytes)}
        </p>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {rows.map((attachment) => (
          <li key={attachment.id}>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-2.5 px-2 py-2 text-left"
              onClick={() => onOpenNote(attachment.noteId)}
            >
              <FileImage className="size-4 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {attachment.fileName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {attachment.noteTitle} · {formatBytes(attachment.size)}
                </span>
              </span>
            </Button>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="p-4 text-center text-xs text-muted-foreground">
          Nothing matches “{query}”.
        </p>
      )}
    </div>
  );
}
