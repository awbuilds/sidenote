"use client";

import { useState } from "react";
import { FilePlus2, FileText, ListTodo, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { docToText, fromMarkdown, toMarkdown } from "@/lib/tiptap/markdown";
import { useCreateNote } from "@/hooks/mutations";
import type { NoteId, NotebookId } from "@/lib/db/types";

/**
 * Note templates.
 *
 * Stored as Markdown and parsed on insert, so a template can be edited by
 * hand in a future settings screen without a migration. Each carries a factory
 * rather than a literal document, because two notes from one template must not
 * share an id.
 */
export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  markdown: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "blank",
    name: "Blank note",
    description: "Just an empty document.",
    icon: <FileText className="size-4" />,
    markdown: "",
  },
  {
    id: "meeting",
    name: "Meeting notes",
    description: "Agenda, decisions, actions.",
    icon: <Sparkles className="size-4" />,
    markdown: [
      "# Meeting notes",
      "",
      "**Date:** ",
      "**Attendees:** ",
      "",
      "## Agenda",
      "",
      "- ",
      "",
      "## Decisions",
      "",
      "- ",
      "",
      "## Actions",
      "",
      "- [ ] ",
    ].join("\n"),
  },
  {
    id: "tasks",
    name: "Task list",
    description: "A single to-do list.",
    icon: <ListTodo className="size-4" />,
    markdown: ["# Tasks", "", "- [ ] ", "- [ ] ", "- [ ] "].join("\n"),
  },
  {
    id: "daily",
    name: "Daily log",
    description: "What happened, what's next.",
    icon: <FilePlus2 className="size-4" />,
    markdown: [
      "# YYYY-MM-DD",
      "",
      "## Done",
      "",
      "- ",
      "",
      "## Next",
      "",
      "- ",
      "",
      "## Notes",
      "",
      "",
    ].join("\n"),
  },
];

export function findTemplate(id: string): NoteTemplate | undefined {
  return NOTE_TEMPLATES.find((template) => template.id === id);
}

/**
 * Create a note from a template.
 *
 * The body is parsed from Markdown at insert time so the document — and the
 * derived Markdown and text used by search — are all correct on the first
 * write. There is no second "fill in the template" pass.
 */
export function useCreateFromTemplate(
  onCreated?: (id: NoteId) => void,
): (templateId: string, notebookId: NotebookId | null) => void {
  const createNote = useCreateNote();

  return (templateId: string, notebookId: NotebookId | null) => {
    const template = findTemplate(templateId) ?? NOTE_TEMPLATES[0];
    const contentJson = fromMarkdown(template.markdown);

    createNote.mutate(
      {
        notebookId,
        title: firstHeading(template.markdown) ?? "",
        contentJson,
        contentMarkdown: toMarkdown(contentJson),
        contentText: docToText(contentJson),
      },
      { onSuccess: (note) => onCreated?.(note.id) },
    );
  };
}

function firstHeading(markdown: string): string | null {
  const match = /^#{1,6}\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : null;
}

/** "New note from template" — the reference's second sidebar action. */
export function NewNoteFromTemplate({
  notebookId,
  onCreated,
  open: controlledOpen,
  onOpenChange,
}: {
  notebookId: NotebookId | null;
  onCreated: (id: NoteId) => void;
  /**
   * Controlled open state. Uncontrolled by default so it can still be used as a
   * standalone sidebar row, and controlled by the "New note" menu so both entry
   * points open the same dialog.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const create = useCreateFromTemplate(onCreated);

  return (
    <>
      {/* Uncontrolled, this component is a sidebar row with its own trigger.
          Controlled, the caller already has a trigger — the "New note" menu —
          and rendering a second full-width button here put a duplicate
          "New note from template" on top of it. */}
      {onOpenChange === undefined && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start gap-2 px-3 text-sm font-normal text-muted-foreground hover:bg-accent/50"
          onClick={() => setOpen(true)}
        >
          <FilePlus2 className="size-4 opacity-70" />
          New note from template
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New note from template</DialogTitle>
            <DialogDescription>
              The body is filled in as Markdown and stays editable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {NOTE_TEMPLATES.map((template) => (
              <Button
                key={template.id}
                variant="ghost"
                className="h-auto w-full justify-start gap-3 px-2 py-2 text-left"
                onClick={() => {
                  create(template.id, notebookId);
                  setOpen(false);
                }}
              >
                <span className="mt-0.5 shrink-0 opacity-70">{template.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{template.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {template.description}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}