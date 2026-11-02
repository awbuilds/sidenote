"use client";

import { useQuery } from "@tanstack/react-query";
import { tagsByNote } from "@/lib/db/repositories/tags";
import type { NoteId, Tag } from "@/lib/db/types";

/**
 * Tags for a batch of notes, keyed by note id.
 *
 * One query for the whole visible list rather than one per row — a note list
 * of 200 rows would otherwise be 200 queries on every sort change.
 */
export function useTagsForNotes(noteIds: NoteId[]): Map<NoteId, Tag[]> {
  const key = [...noteIds].sort().join(",");

  const { data } = useQuery({
    queryKey: ["tags", "for-notes", key],
    queryFn: () => tagsByNote(noteIds),
    // A new note id invalidates the batch; re-fetching on every render would
    // thrash the index.
    enabled: noteIds.length > 0,
  });

  return data ?? new Map<NoteId, Tag[]>();
}

/** Total non-empty lines across a set of notes — drives the "M notes" label. */
export function countLines(texts: string[]): number {
  return texts.reduce(
    (total, text) =>
      total + text.split("\n").filter((line) => line.trim() !== "").length,
    0,
  );
}