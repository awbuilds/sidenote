"use client";

import { useState } from "react";
import { ChevronDown, FileText, Hash, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useSetNoteTags } from "@/hooks/mutations";
import { tagsForNote } from "@/lib/db/repositories/tags";
import { useQuery } from "@tanstack/react-query";
import type { NoteId } from "@/lib/db/types";
import { QUERY_KEYS } from "@/hooks/query-keys";

/**
 * Tag chips in the editor's title bar.
 *
 * Click to remove, "+" to add. The chips are the note's tags rendered inline
 * rather than behind a menu, so they read as part of the note's identity.
 */
/** Tags shown before the rest collapse into a "+N" menu. */
const MAX_VISIBLE_TAGS = 3;

export function TagChips({ noteId }: { noteId: NoteId }) {
  const [draft, setDraft] = useState("");
  const setTags = useSetNoteTags();

  const { data: tags } = useQuery({
    queryKey: QUERY_KEYS.noteTags(noteId),
    queryFn: () => tagsForNote(noteId),
  });

  const current = tags ?? [];
  const names = current.map((tag) => tag.name);

  const add = (name: string) => {
    const normalized = name.trim().toLowerCase();
    if (normalized === "" || names.includes(normalized)) return;
    setTags.mutate({ noteId, names: [...names, normalized] });
    setDraft("");
  };

  // The reference shows three tags then a "+N" overflow. Beyond a handful the
  // row would push the title bar controls off the end, so the rest collapse.
  const visible = current.slice(0, MAX_VISIBLE_TAGS);
  const overflow = current.length - visible.length;

  return (
    <div className="flex min-w-0 shrink items-center gap-1 overflow-hidden">
      {visible.map((tag) => (
        <Badge key={tag.id} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
          <Hash className="size-2.5" />
          <button
            type="button"
            onClick={() => setTags.mutate({ noteId, names: names.filter((n) => n !== tag.name) })}
            aria-label={`Remove tag ${tag.name}`}
            className="max-w-32 truncate hover:text-destructive"
          >
            {tag.name}
          </button>
        </Badge>
      ))}

      {overflow > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="h-5 gap-0.5 px-1.5 text-xs font-normal"
              aria-label={`${overflow} more tags`}
            >
              +{overflow}
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {current.slice(MAX_VISIBLE_TAGS).map((tag) => (
              <DropdownMenuItem
                key={tag.id}
                onSelect={() =>
                  setTags.mutate({ noteId, names: names.filter((n) => n !== tag.name) })
                }
              >
                <Hash className="size-3.5" />
                <span className="flex-1 truncate">{tag.name}</span>
                <span className="text-xs text-muted-foreground">Remove</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6" aria-label="Add tag">
            <Hash className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-2">
          <Input
            value={draft}
            autoFocus
            placeholder="Tag name…"
            aria-label="New tag"
            className="h-8"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(draft);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Word and character count.
 *
 * The character count is the headline because that is what people check before
 * sharing; words sit in the popover.
 */
export function CountIndicator({
  words,
  characters,
  blocks,
}: {
  words: number;
  characters: number;
  blocks: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground"
        >
          <FileText className="size-3.5" />
          <span className="tabular-nums">{characters.toLocaleString()}</span>
          <span className="hidden sm:inline">chars</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Document</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="justify-between">
          Characters <span className="tabular-nums">{characters.toLocaleString()}</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="justify-between">
          Words <span className="tabular-nums">{words.toLocaleString()}</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="justify-between">
          Blocks <span className="tabular-nums">{blocks.toLocaleString()}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Read-only lock.
 *
 * A local-first note has no server to protect, so this is a guard against
 * accidental editing — not a security control. It is a per-session UI state,
 * deliberately not persisted: a note that stays read-only tomorrow is a bug.
 */
export function LockToggle({
  locked,
  onToggle,
}: {
  locked: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={locked ? "Unlock note for editing" : "Lock note against editing"}
      aria-pressed={locked}
      onClick={onToggle}
    >
      {locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
    </Button>
  );
}

/**
 * Editor read-only state, scoped to the note it was set on.
 *
 * Derived rather than reset in an effect: a lock that was set on note A must
 * not carry over to note B, and the honest way to express that is to record
 * which note the lock belongs to rather than clearing it on a timer.
 */
export function useReadOnly(noteId: string): [boolean, () => void] {
  const [state, setState] = useState<{ noteId: string; locked: boolean }>({
    noteId,
    locked: false,
  });

  const locked = state.noteId === noteId ? state.locked : false;

  return [
    locked,
    () =>
      setState((previous) => ({
        noteId,
        locked: !(previous.noteId === noteId && previous.locked),
      })),
  ];
}
