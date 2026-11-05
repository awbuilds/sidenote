"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { FileText, Folder, Hash, Plus, Search, Settings, Trash2 } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PetDialogContent } from "@/components/companion/PetDialogContent";
import { useNotebookTree, useRecentNotes } from "@/hooks/queries";
import { useCreateNotebook, useCreateNote } from "@/hooks/mutations";
import { useWorkspaceParams } from "@/hooks/useWorkspaceParams";
import { useTagSummaries } from "@/hooks/useTags";
import { useTheme } from "@/components/providers/theme-provider";
import { flattenTree } from "@/lib/db/tree";
import { preview } from "@/lib/format";
import {
  getCommandPaletteOpen,
  setCommandPaletteOpen,
  subscribeCommandPalette,
  toggleCommandPalette,
} from "@/lib/ui-store";

/**
 * Command palette (⌘K / Ctrl-K).
 *
 * Everything here is an action that already exists elsewhere in the UI — this
 * is a faster path to it, not a second implementation.
 */
export function CommandPalette() {
  const open = useSyncExternalStore(
    subscribeCommandPalette,
    getCommandPaletteOpen,
    () => false,
  );
  const router = useRouter();
  const { params, setParam, selectNote, selectNotebook } = useWorkspaceParams();
  const { setTheme } = useTheme();
  // Only fetched when the palette is open — the workspace should not read
  // note rows for a dialog nobody has opened yet.
  const { data: notes } = useRecentNotes(12, open);
  const { data: tree } = useNotebookTree();
  const { data: tags } = useTagSummaries(open);
  const createNote = useCreateNote();
  const createNotebook = useCreateNotebook();

  const notebooks = useMemo(() => (tree ? flattenTree(tree) : []), [tree]);
  const recent = notes ?? [];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleCommandPalette();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (action: () => void) => () => {
    setCommandPaletteOpen(false);
    action();
  };

  return (
    <Dialog open={open} onOpenChange={setCommandPaletteOpen}>
      <PetDialogContent
        mode="command"
        className="sm:w-[36rem]"
        fallbackClassName="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search notes, or jump to something.</DialogDescription>
        </DialogHeader>
        <Command>
        <CommandInput placeholder="Search notes and commands…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>

          <CommandGroup heading="Notes">
            {recent.map((note) => (
              <CommandItem
                key={note.id}
                value={`note ${note.title} ${preview(note.contentText, 40)}`}
                onSelect={run(() => {
                  if (params.notebookId !== note.notebookId && note.notebookId !== null) {
                    selectNotebook(note.notebookId);
                  }
                  selectNote(note.id);
                })}
              >
                <FileText className="size-4" />
                <span className="truncate">
                  {note.title.trim() === "" ? "Untitled note" : note.title}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>

          {notebooks.length > 0 && (
            <CommandGroup heading="Notebooks">
              {notebooks.map((notebook) => (
                <CommandItem
                  key={notebook.id}
                  value={`notebook ${notebook.name}`}
                  onSelect={run(() => selectNotebook(notebook.id))}
                >
                  <Folder className="size-4" />
                  <span className="truncate">{notebook.name}</span>
                  <CommandShortcut>{notebook.totalNoteCount || ""}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {tags !== undefined && tags.length > 0 && (
            <CommandGroup heading="Tags">
              {tags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={`tag ${tag.name}`}
                  onSelect={run(() => setParam("tag", tag.id))}
                >
                  <Hash className="size-4" />
                  <span className="truncate">{tag.name}</span>
                  <CommandShortcut>{tag.noteCount || ""}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem
              value="new note"
              onSelect={run(() => {
                createNote.mutate({ notebookId: params.notebookId }, { onSuccess: (note) => selectNote(note.id) });
              })}
            >
              <Plus className="size-4" />
              New note
            </CommandItem>
            <CommandItem
              value="new notebook"
              onSelect={run(() => createNotebook.mutate({ name: "New notebook", parentId: null }))}
            >
              <Plus className="size-4" />
              New notebook
            </CommandItem>
            <CommandItem value="go to trash" onSelect={run(() => router.push("/trash"))}>
              <Trash2 className="size-4" />
              Go to trash
            </CommandItem>
            <CommandItem value="go to settings" onSelect={run(() => router.push("/settings"))}>
              <Settings className="size-4" />
              Settings
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Appearance">
            <CommandItem value="theme light" onSelect={run(() => setTheme("light"))}>
              <Search className="size-4" />
              Use light theme
            </CommandItem>
            <CommandItem value="theme dark" onSelect={run(() => setTheme("dark"))}>
              <Search className="size-4" />
              Use dark theme
            </CommandItem>
            <CommandItem value="theme system" onSelect={run(() => setTheme("system"))}>
              <Search className="size-4" />
              Follow system theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
      </PetDialogContent>
    </Dialog>
  );
}
