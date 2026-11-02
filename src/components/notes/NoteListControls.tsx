"use client";

import { ArrowDownAZ, ArrowDownWideNarrow, List, Pin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type NoteSort = "updated" | "created" | "title";
export type SortDirection = "asc" | "desc";

export interface SortState {
  sort: NoteSort;
  direction: SortDirection;
  pinnedFirst: boolean;
}

export const DEFAULT_SORT: SortState = {
  sort: "updated",
  direction: "desc",
  pinnedFirst: true,
};

const LABELS: Record<NoteSort, string> = {
  updated: "Last edited",
  created: "Date created",
  title: "Title",
};

/**
 * Sort notes.
 *
 * A stable two-key comparison: the secondary key is the id, so notes that tie
 * on the primary key never reshuffle between renders — the classic bug where a
 * list reorders itself on every autosave.
 */
export function sortNotes<T extends {
  isPinned: boolean;
  title: string;
  updatedAt: number;
  createdAt: number;
  id: string;
}>(notes: T[], state: SortState): T[] {
  const factor = state.direction === "asc" ? 1 : -1;

  // Title is a string and the timestamps are numbers, so they need different
  // comparisons — subtracting strings yields NaN and silently sorts nothing.
  const compare = (a: T, b: T): number => {
    if (state.sort === "title") {
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    }
    if (state.sort === "created") return a.createdAt - b.createdAt;
    return a.updatedAt - b.updatedAt;
  };

  return [...notes].sort((a, b) => {
    if (state.pinnedFirst && a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    const primary = compare(a, b);
    if (primary !== 0) return primary * factor;
    // Stable tiebreak on id.
    return a.id.localeCompare(b.id);
  });
}

/** Header controls: sort order, density, and a pin filter. */
export function NoteListControls({
  state,
  onChange,
  density,
  onDensityChange,
  className,
}: {
  state: SortState;
  onChange: (next: SortState) => void;
  density: "comfortable" | "compact";
  onDensityChange: (next: "comfortable" | "compact") => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("size-7 shrink-0", className)} aria-label="Sort and filter">
          <ArrowDownWideNarrow className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        {(Object.keys(LABELS) as NoteSort[]).map((sort) => (
          <DropdownMenuCheckboxItem
            key={sort}
            checked={state.sort === sort}
            onCheckedChange={() => onChange({ ...state, sort })}
            onSelect={(event) => event.preventDefault()}
          >
            {LABELS[sort]}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onChange({ ...state, direction: state.direction === "desc" ? "asc" : "desc" })}
        >
          <ArrowDownAZ className="size-4" />
          {state.direction === "desc" ? "Descending" : "Ascending"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange({ ...state, sort: "title" })}>
          <ArrowDownAZ className="size-4" />
          Sort A–Z
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={state.pinnedFirst}
          onCheckedChange={(checked) => onChange({ ...state, pinnedFirst: checked === true })}
          onSelect={(event) => event.preventDefault()}
        >
          <Pin className="size-4" />
          Pinned first
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={density === "compact"}
          onCheckedChange={(checked) => onDensityChange(checked === true ? "compact" : "comfortable")}
          onSelect={(event) => event.preventDefault()}
        >
          <List className="size-4" />
          Compact list
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { Search };