"use client";

import { useState } from "react";
import { ChevronDown, FilePlus2, FolderPlus, HardDriveDownload, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateNote, useCreateNotebook } from "@/hooks/mutations";
import { NewNoteFromTemplate } from "@/components/notes/NoteTemplates";
import { cn } from "@/lib/utils";
import type { NoteId, NotebookId } from "@/lib/db/types";

/**
 * The primary "New note" action, with a menu of the alternatives.
 *
 * The button lands in the currently selected notebook, so it is the fast path
 * and the menu is where the deliberate choices go. Only options that do
 * something real are listed.
 *
 * Import is a link to settings rather than a second entry point: importing
 * merges or overwrites notebooks, and that flow has a confirmation step which
 * is not something to reimplement behind a dropdown.
 */
export function NewNoteButton({
  notebookId,
  onCreated,
  className,
}: {
  /** `null` means unfiled. */
  notebookId: NotebookId | null;
  onCreated: (id: NoteId) => void;
  className?: string;
}) {
  const createNote = useCreateNote();
  const createNotebook = useCreateNotebook();
  const [templateOpen, setTemplateOpen] = useState(false);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant="secondary"
        className="h-8 min-w-0 flex-1 justify-start gap-2 px-3 text-sm font-medium"
        onClick={() =>
          createNote.mutate({ notebookId }, { onSuccess: (note) => onCreated(note.id) })
        }
      >
        <Plus className="size-4 shrink-0" />
        <span className="truncate">New note</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="size-8 shrink-0"
            aria-label="More ways to create a note"
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Create</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
            <FilePlus2 className="size-4" />
            From a template
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              createNotebook.mutate(
                { name: "New notebook" },
                {
                  onSuccess: (notebook) =>
                    createNote.mutate(
                      { notebookId: notebook.id },
                      { onSuccess: (note) => onCreated(note.id) },
                    ),
                },
              )
            }
          >
            <FolderPlus className="size-4" />
            In a new notebook
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <HardDriveDownload className="size-4" />
              Import or restore a backup
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewNoteFromTemplate
        notebookId={notebookId}
        onCreated={onCreated}
        open={templateOpen}
        onOpenChange={setTemplateOpen}
      />
    </div>
  );
}
