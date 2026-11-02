"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { noteIdsForTag, pruneUnusedTags, tagsByNote } from "@/lib/db/repositories/tags";
import { listNotes } from "@/lib/db/repositories/notes";
import type { NoteId, Tag } from "@/lib/db/types";

/** The `?tag=` filter, or null. */
export function useTagFilter(): string | null {
  return useSearchParams().get("tag");
}

export interface TagSummary extends Tag {
  noteCount: number;
}

/** Every tag in use, with a live note count. */
export function useTagSummaries() {
  return useQuery({
    queryKey: ["tags", "summaries"],
    queryFn: async (): Promise<TagSummary[]> => {
      const notes = await listNotes();
      if (notes.length === 0) return [];

      const linked = await tagsByNote(notes.map((note) => note.id));
      const counts = new Map<string, number>();
      for (const tags of linked.values()) {
        for (const tag of tags) counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
      }

      const seen = new Map<string, Tag>();
      for (const tags of linked.values()) {
        for (const tag of tags) seen.set(tag.id, tag);
      }

      return [...seen.values()]
        .map((tag) => ({ ...tag, noteCount: counts.get(tag.id) ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/** Note ids carrying a tag — drives filtering in the note list. */
export function useTaggedNoteIds(tagId: string | null): NoteId[] | null {
  const { data } = useQuery({
    queryKey: ["tags", tagId, "notes"],
    queryFn: () => noteIdsForTag(tagId as string),
    enabled: tagId !== null,
  });
  return tagId === null ? null : (data ?? []);
}

export { pruneUnusedTags };
