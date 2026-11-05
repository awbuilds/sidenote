"use client";

import { useMemo, useState } from "react";
import {
  Check,
  FileText,
  Link2,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  SquarePen,
  Star,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PetAlertDialog } from "@/components/companion/PetAlertDialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { pluralize, preview, relativeTime } from "@/lib/format";
import { groupNotesByDate } from "@/lib/note-groups";
import { tagChipClass } from "@/lib/tag-color";
import { useNotes, useSettings } from "@/hooks/queries";
import { useSearch } from "@/hooks/useSearch";
import { useLongPress } from "@/hooks/use-long-press";
import { useTagFilter, useTaggedNoteIds } from "@/hooks/useTags";
import { NoResults, SearchResultRow } from "./SearchResults";
import { useTagsForNotes } from "@/hooks/useTagsForNotes";
import { useLinkCounts } from "@/hooks/queries";
import {
  DEFAULT_SORT,
  NoteListControls,
  sortNotes,
  type SortState,
} from "./NoteListControls";
import {
  useCreateNote,
  useMoveNotes,
  useRenameNote,
  useTogglePin,
  useTrashNotes,
  useUpdateSettings,
} from "@/hooks/mutations";
import { NotebookPickerDialog } from "@/components/notebooks/NotebookPickerDialog";
import type { Note, NoteId, NotebookId, Tag } from "@/lib/db/types";

export function NoteListPane({
  notebookId,
  selectedNoteId,
  onSelectNote,
  onNoteCreated,
  query,
  onQueryChange,
  emptyMessage,
  scopeLabel = "All notes",
}: {
  /** `undefined` = every note, `null` = unfiled only, otherwise a notebook id. */
  notebookId?: NotebookId | null;
  /** Human name for the current scope, shown in the list header. */
  scopeLabel?: string;
  selectedNoteId: NoteId | null;
  onSelectNote: (id: NoteId) => void;
  onNoteCreated: (id: NoteId) => void;
  query: string;
  onQueryChange: (value: string) => void;
  emptyMessage?: string;
}) {
  const { data, isPending } = useNotes({ notebookId });
  const createNote = useCreateNote();
  const moveNotes = useMoveNotes();
  const trashNotes = useTrashNotes();
  const search = useSearch(query);
  const tagId = useTagFilter();
  const taggedIds = useTaggedNoteIds(tagId);

  const [selected, setSelected] = useState<Set<NoteId>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const density = settings?.listDensity ?? "comfortable";

  const notes = useMemo(() => data ?? [], [data]);
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery !== "";

  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  const hitById = useMemo(() => new Map(search.hits.map((hit) => [hit.id, hit])), [search.hits]);

  /**
   * Three sources, one list:
   *  - a query  -> the search index, ranked
   *  - a tag    -> every note carrying it
   *  - neither  -> the current notebook listing
   * A notebook selection always narrows the result, so a tag view inside one
   * notebook cannot show notes from elsewhere.
   */
  const visible = useMemo(() => {
    if (isSearching) {
      const scope = tagId === null ? null : new Set(taggedIds ?? []);
      return search.hits
        .filter((hit) => (scope === null ? true : scope.has(hit.id)))
        .map((hit) => hit.id);
    }
    if (tagId !== null) {
      const tagged = new Set(taggedIds ?? []);
      return notes.filter((note) => tagged.has(note.id)).map((note) => note.id);
    }
    return notes.map((note) => note.id);
  }, [isSearching, search.hits, tagId, taggedIds, notes]);

  // Sorted notes are ordered by the user; search hits keep their relevance
  // ranking, because a user searching for a term wants the best match first,
  // not A-Z.
  const ordered = useMemo(() => {
    if (isSearching) return visible;
    const rows = visible
      .map((id) => noteById.get(id))
      .filter((note): note is Note => note !== undefined);
    return sortNotes(rows, sort).map((note) => note.id);
  }, [isSearching, visible, noteById, sort]);

  const selectedIds = [...selected];
  const selectionMode = selectMode || selected.size > 0;

  const toggleOne = (id: NoteId) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearSelection = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  const onCreated = (note: Note) => {
    onNoteCreated(note.id);
    if (notebookId !== undefined && note.notebookId !== notebookId) {
      // Only a note landing outside the current view is worth complaining about.
      return;
    }
  };

  const tagsByNote = useTagsForNotes(ordered);
  const linksByNote = useLinkCounts(ordered);
  const scopeName = scopeLabel;

  // Date grouping only makes sense when the list is ordered by time.
  const grouped = !isSearching && sort.sort === "updated";
  const groups = useMemo(() => {
    if (!grouped) return [];
    const rows = ordered
      .map((id) => noteById.get(id))
      .filter((note): note is Note => note !== undefined);
    return groupNotesByDate(rows, sort.pinnedFirst);
  }, [grouped, ordered, noteById, sort.pinnedFirst]);

  const enterSelectionWith = (id: NoteId) => {
    setSelectMode(true);
    setSelected(new Set([id]));
  };

  const renderNoteRow = (note: Note) => (
    <NoteRow
      note={note}
      tags={tagsByNote.get(note.id) ?? []}
      links={linksByNote.get(note.id)}
      selectionMode={selectionMode}
      checked={selected.has(note.id)}
      onToggleCheck={() => toggleOne(note.id)}
      onLongPressSelect={() => enterSelectionWith(note.id)}
      density={density}
      selected={selectedNoteId === note.id}
      onSelect={() => onSelectNote(note.id)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-3 pt-3">
        <h2 className="truncate text-sm font-semibold">{scopeName}</h2>
        <p className="text-xs text-muted-foreground">
          {isSearching
            ? `${pluralize(ordered.length, "result")} for “${trimmedQuery}”`
            : `${scopeName === "All notes" ? "Every notebook" : "Current notebook"} · ${pluralize(ordered.length, "note")}`}
        </p>
      </div>

      <div className="shrink-0 space-y-2 border-b p-2">
        <div className="flex items-center gap-1.5">
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search notes…"
            aria-label="Search notes"
            className="h-8"
          />
          <NoteListControls
            state={sort}
            onChange={setSort}
            density={density}
            onDensityChange={(value) => updateSettings.mutate({ listDensity: value })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={selectionMode ? "Exit selection" : "Select notes"}
            aria-pressed={selectionMode}
            onClick={() => (selectionMode ? clearSelection() : setSelectMode(true))}
          >
            {selectionMode ? <X className="size-4" /> : <Check className="size-4" />}
          </Button>
          <Button
            size="sm"
            className="h-8 shrink-0 gap-1.5"
            disabled={createNote.isPending}
            onClick={() =>
              createNote.mutate(
                { notebookId: notebookId ?? null },
                { onSuccess: onCreated },
              )
            }
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </div>

        {selectionMode && (
          <BulkBar
            count={selected.size}
            onMove={() => setMoveOpen(true)}
            onTrash={() => setTrashOpen(true)}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isPending && !isSearching ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : ordered.length === 0 ? (
          isSearching ? (
            <NoResults query={trimmedQuery} />
          ) : (
            <EmptyNotes
              message={emptyMessage ?? "No notes here yet."}
              onCreate={() =>
                createNote.mutate({ notebookId: notebookId ?? null }, { onSuccess: onCreated })
              }
            />
          )
        ) : grouped ? (
          <div className="space-y-4 p-2">
            {groups.map((group) => (
              <section key={group.key}>
                <h3 className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h3>
                <ul className="space-y-2">
                  {group.notes.map((note) => (
                    <li key={note.id}>{renderNoteRow(note)}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="space-y-2 p-2">
            {ordered.map((id) => {
              const note = noteById.get(id);
              const hit = hitById.get(id);
              if (note === undefined && hit === undefined) return null;
              return (
                <li key={id}>
                  {hit !== undefined ? (
                    <SearchResultRow
                      hit={hit}
                      active={selectedNoteId === id}
                      onSelect={() => onSelectNote(id)}
                    />
                  ) : note !== undefined ? (
                    renderNoteRow(note)
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <NotebookPickerDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        title={`Move ${pluralize(selectedIds.length, "note")}`}
        description="Choose the destination notebook."
        confirmLabel="Move"
        pending={false}
        onConfirm={(target) => moveNotes.mutate({ ids: selectedIds, notebookId: target })}
      />

      <PetAlertDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title={`Move ${pluralize(selectedIds.length, "note")} to trash?`}
        description="They can be restored from the trash until you empty it."
        confirmLabel="Move to trash"
        tone="warning"
        onConfirm={() => {
          trashNotes.mutate(selectedIds, { onSuccess: clearSelection });
        }}
      />
    </div>
  );
}

function BulkBar({
  count,
  onMove,
  onTrash,
}: {
  count: number;
  onMove: () => void;
  onTrash: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
      <span className="flex-1 text-xs tabular-nums text-muted-foreground">
        {pluralize(count, "note")} selected
      </span>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onMove} disabled={count === 0}>
        Move
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-destructive"
        onClick={onTrash}
        disabled={count === 0}
      >
        Trash
      </Button>
    </div>
  );
}

function NoteRow({
  note,
  tags,
  links,
  selectionMode,
  checked,
  onToggleCheck,
  onLongPressSelect,
  density,
  selected,
  onSelect,
}: {
  note: Note;
  tags: Tag[];
  links?: { outgoing: number; incoming: number };
  selectionMode: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onLongPressSelect: () => void;
  density: "comfortable" | "compact";
  selected: boolean;
  onSelect: () => void;
}) {
  const pin = useTogglePin();
  const rename = useRenameNote();
  const trash = useTrashNotes();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(note.title);
  const longPress = useLongPress(onLongPressSelect);

  const title = note.title.trim() === "" ? "Untitled note" : note.title;
  const snippet = preview(note.contentText, 120, note.title);
  const compact = density === "compact";
  const hasLinks = links !== undefined && (links.outgoing > 0 || links.incoming > 0);

  if (renaming) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          rename.mutate({ id: note.id, title: draft }, { onSuccess: () => setRenaming(false) });
        }}
        className="rounded-lg border bg-card p-1"
      >
        <Input
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setRenaming(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setRenaming(false);
          }}
          aria-label="Note title"
          className="h-8"
        />
      </form>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-start gap-1 rounded-lg border transition-colors",
        compact ? "p-1.5" : "p-2",
        selected
          ? "border-primary/40 bg-primary/10"
          : "border-transparent hover:border-border hover:bg-accent/40",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        role="checkbox"
        aria-checked={checked}
        aria-label={`Select ${title}`}
        onClick={onToggleCheck}
        className={cn(
          "size-6 shrink-0 self-center rounded-full",
          !selectionMode &&
            "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        )}
      >
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-full border transition-colors",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 hover:border-muted-foreground",
          )}
        >
          {checked && <Check className="size-3" />}
        </span>
      </Button>

      <button
        type="button"
        {...longPress}
        onClick={selectionMode ? onToggleCheck : onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex w-full items-center gap-1.5">
          {note.isPinned && (
            <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Pinned" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              note.isPinned || selected ? "font-semibold" : "font-medium",
            )}
          >
            {title}
          </span>
        </span>

        {!compact && snippet !== "" && (
          <span
            className={cn(
              "mt-1 block text-xs leading-relaxed",
              "line-clamp-2 text-muted-foreground",
              selected && "text-foreground/80",
            )}
          >
            {snippet}
          </span>
        )}

        {hasLinks && (
          <span className="mt-1.5 flex items-center gap-1 text-[11px] leading-none text-muted-foreground">
            <Link2 className="size-3 shrink-0" />
            <span className="tabular-nums">
              {/* Only the directions that exist. "0 outgoing · 1 backlinks"
                  reads like a missing value rather than a count. */}
              {[
                links!.outgoing > 0 ? `${links!.outgoing} outgoing` : null,
                links!.incoming > 0 ? `${links!.incoming} backlinks` : null,
              ]
                .filter((part): part is string => part !== null)
                .join(" · ")}
            </span>
          </span>
        )}

        <span className="mt-1.5 flex w-full items-center gap-2">
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {relativeTime(note.updatedAt)}
          </span>
          {tags.length > 0 && (
            <span className="flex min-w-0 flex-1 flex-wrap justify-end gap-1">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className={cn(
                    "max-w-28 truncate rounded px-1.5 py-0.5 text-[10px] leading-none",
                    tagChipClass(tag.color),
                  )}
                >
                  #{tag.name}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>

      {!selectionMode && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 size-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label={`Actions for ${title}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => pin.mutate(note.id)}>
              {note.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {note.isPinned ? "Unpin" : "Pin to top"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setDraft(note.title);
                setRenaming(true);
              }}
            >
              <SquarePen className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => trash.mutate([note.id])}>
              <Trash2 className="size-4" />
              Move to trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function EmptyNotes({ message, onCreate }: { message?: string; onCreate?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <FileText className="size-6 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message ?? "No notes here yet."}</p>
      {onCreate !== undefined && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onCreate}>
          <Plus className="size-4" />
          Create a note
        </Button>
      )}
    </div>
  );
}
