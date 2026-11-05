"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  FileText,
  Link,
  Link2,
  ListTree,
  Maximize2,
  MoreHorizontal,
  PenLine,
  Pin,
  PinOff,
  Printer,
  Share2,
  X,
} from "lucide-react";
import type { Editor } from "@tiptap/react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PetAlertDialog } from "@/components/companion/PetAlertDialog";

import { NoteEditor } from "@/components/editor/NoteEditor";
import { MarkdownSource } from "@/components/editor/MarkdownSource";
import { VersionHistory } from "@/components/editor/VersionHistory";
import { EditorOutline } from "@/components/editor/EditorOutline";
import { BacklinksPanel } from "@/components/editor/BacklinksPanel";
import { CountIndicator, LockToggle, TagChips, useReadOnly } from "@/components/editor/TitleBar";
import { LinkNoteDialog } from "@/components/editor/LinkNoteDialog";
import { LastEdited } from "@/components/editor/LastEdited";
import { useFocusMode } from "@/components/layout/FocusMode";
import { ShareDialog } from "@/components/share/ShareDialog";

import { db } from "@/lib/db/db";
import { fromNoteRow } from "@/lib/db/convert";
import { docToText, fromMarkdown, toMarkdown } from "@/lib/tiptap/markdown";
import { QUERY_KEYS } from "@/hooks/query-keys";
import { useSaveNoteContent, useTogglePin, useTrashNotes } from "@/hooks/mutations";
import { downloadTextFile, exportNoteAsHtml } from "@/lib/transfer/export-note";
import { wikiLink } from "@/lib/links/wiki";
import { isRemoteEnabled } from "@/lib/supabase/config";
import type { Note, NoteId } from "@/lib/db/types";
import { toast } from "sonner";

type View = "rich" | "markdown" | "history";

/**
 * Copy a reference to this note.
 *
 * Not a URL: a `[[wiki link]]` resolves to this note wherever it is pasted
 * inside the app. Public sharing is the Share dialog, which produces a real
 * link backed by the sync server.
 */
async function copyNoteLink(note: Note): Promise<void> {
  const title = note.title.trim();
  if (title === "") {
    toast.error("Give the note a title first", {
      description: "A link needs a name to point at.",
    });
    return;
  }

  const reference = wikiLink(title);
  try {
    await navigator.clipboard.writeText(reference);
    toast.success("Copied a link to this note", {
      description: `Paste ${reference} into any note and it resolves.`,
    });
  } catch {
    toast.error("Could not copy", { description: reference });
  }
}

export function EditorPane({
  noteId,
  onNoteDeleted,
  onOpenNote,
}: {
  noteId: NoteId | null;
  onNoteDeleted: () => void;
  /** Follow a link to another note. */
  onOpenNote: (id: NoteId) => void;
}) {
  const [view, setView] = useState<View>("rich");
  const pin = useTogglePin();
  const trash = useTrashNotes();
  const save = useSaveNoteContent();

  // The live editor, so the outline and the status bar can read it without
  // NoteEditor owning their rendering.
  const [editor, setEditor] = useState<Editor | null>(null);
  // The right rail has two views. `null` is a real third state: the rail can be
  // closed entirely, which is neither tab.
  const [railTab, setRailTab] = useState<"outline" | "links" | null>("outline");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const shareEnabled = isRemoteEnabled();
  const [focus, toggleFocus] = useFocusMode();
  const [locked, toggleLocked] = useReadOnly(noteId ?? "");

  // Counts come from the editor's own callbacks rather than a subscription
  // here: the editor already knows when the document changed, so pushing the
  // value up from `onUpdate` avoids a second listener entirely.
  const [counts, setCounts] = useState({ words: 0, characters: 0, blocks: 0 });

  const { data: note, isPending } = useQuery({
    queryKey: QUERY_KEYS.note(noteId ?? ""),
    queryFn: async () => {
      const row = await db().notes.get(noteId as string);
      return row ? fromNoteRow(row) : undefined;
    },
    enabled: noteId !== null,
  });

  if (noteId === null) {
    return (
      <EmptyEditor
        icon={<PenLine className="size-6" />}
        title="Nothing selected"
        body="Pick a note from the list, or create one to start writing."
      />
    );
  }

  if (isPending) return <EditorSkeleton />;

  if (!note) {
    return (
      <EmptyEditor
        icon={<FileText className="size-6" />}
        title="Note not found"
        body="It may have been deleted. Pick another from the list."
      />
    );
  }

  const commitMarkdown = (markdown: string) => {
    const doc = fromMarkdown(markdown);
    save.mutate({
      id: note.id,
      patch: { contentJson: doc, contentMarkdown: markdown, contentText: docToText(doc) },
    });
  };

  return (
    // One Tabs wraps the trigger list *and* every TabsContent. Radix throws
    // if a TabsContent is rendered outside its Tabs, so they cannot be
    // siblings in the header.
    <Tabs
      value={view}
      onValueChange={(value) => setView(value as View)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <ShareDialog noteId={note.id} open={shareOpen} onOpenChange={setShareOpen} />
      <PetAlertDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title="Move this note to trash?"
        description="It can be restored from the trash until you empty it."
        confirmLabel="Move to trash"
        tone="warning"
        onConfirm={() => trash.mutate([note.id], { onSuccess: onNoteDeleted })}
      />
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <TabsList className="h-7">
            <TabsTrigger value="rich" className="h-6 text-xs">
              Editor
            </TabsTrigger>
            <TabsTrigger value="markdown" className="h-6 text-xs">
              Markdown
            </TabsTrigger>
            <TabsTrigger value="history" className="h-6 text-xs">
              History
            </TabsTrigger>
          </TabsList>

        <div className="flex-1" />
        <TagChips noteId={note.id} />
        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Copy a link to this note"
          onClick={() => void copyNoteLink(note)}
        >
          <Link className="size-4" />
        </Button>
        <LastEdited timestamp={note.updatedAt} />
        <CountIndicator {...counts} />
        <LockToggle locked={locked} onToggle={toggleLocked} />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Focus mode"
          aria-pressed={focus}
          onClick={toggleFocus}
        >
          <Maximize2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8", railTab === "outline" && "bg-accent text-accent-foreground")}
          aria-label="Toggle outline"
          aria-pressed={railTab === "outline"}
          onClick={() => setRailTab((tab) => (tab === "outline" ? null : "outline"))}
        >
          <ListTree className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8", railTab === "links" && "bg-accent text-accent-foreground")}
          aria-label="Toggle linked notes"
          aria-pressed={railTab === "links"}
          onClick={() => setRailTab((tab) => (tab === "links" ? null : "links"))}
        >
          <Link2 className="size-4" />
        </Button>

        {shareEnabled && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Share this note"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="size-4" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Note actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => pin.mutate(note.id)}>
              {note.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {note.isPinned ? "Unpin from top" : "Pin to top"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                downloadTextFile(
                  `${slugify(note.title) || "note"}.md`,
                  toMarkdown(note.contentJson),
                  "text/markdown",
                )
              }
            >
              <Download className="size-4" />
              Export as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportNoteAsHtml(note)}>
              <Download className="size-4" />
              Export as HTML
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                window.open(`/print/${note.id}`, "_blank", "noopener,noreferrer")
              }
            >
              <Printer className="size-4" />
              Print / PDF
            </DropdownMenuItem>
            {shareEnabled && (
              <DropdownMenuItem onSelect={() => setShareOpen(true)}>
                <Share2 className="size-4" />
                Share link…
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setTrashOpen(true)}
            >
              Move to trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TabsContent value="rich" className="relative flex min-h-0 flex-1 flex-row">
        <LinkNoteDialog
          editor={editor}
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          excludeNoteId={note.id}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <NoteEditor
            key={note.id}
            note={note}
            onEditorReady={setEditor}
            onStatsChange={setCounts}
            onOpenNote={onOpenNote}
            readOnly={locked}
            onLinkNote={() => setLinkDialogOpen(true)}
            onOpenOutline={() => setRailTab("outline")}
          />
        </div>
        {railTab === "outline" && (
          <EditorOutline editor={editor} onClose={() => setRailTab(null)} />
        )}
        {railTab === "links" && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-64 shrink-0 flex-col border-l bg-background shadow-lg xl:static xl:z-auto xl:shadow-none">
            <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3">
              <Link2 className="size-3.5 opacity-70" />
              <span className="flex-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Linked notes
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label="Close linked notes"
                onClick={() => setRailTab(null)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <BacklinksPanel noteId={note.id} onOpenNote={onOpenNote} />
          </aside>
        )}
      </TabsContent>

      <TabsContent value="markdown" className="flex min-h-0 flex-1 flex-col">
        <MarkdownSource
          key={`${note.id}:markdown`}
          doc={note.contentJson}
          onChange={commitMarkdown}
        />
      </TabsContent>

      <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto">
        <VersionHistory
          noteId={note.id}
          currentVersion={note.version}
          onRestored={() => setView("rich")}
        />
      </TabsContent>
    </Tabs>
  );
}

function EditorSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 p-8">
      <div className="h-8 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
    </div>
  );
}

function EmptyEditor({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="text-muted-foreground/50">{icon}</span>
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type { Note };
