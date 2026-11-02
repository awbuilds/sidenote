"use client";

import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { listNotebooks, noteCountsByNotebook } from "@/lib/db/repositories/notebooks";
import { listNotes, listTrashedNotes } from "@/lib/db/repositories/notes";
import { backlinksFor, linkCounts, outgoingLinks } from "@/lib/db/repositories/links";
import { listAllAttachments, type AttachmentSummary } from "@/lib/db/repositories/attachments";
import { getSettings } from "@/lib/db/repositories/settings";
import { buildNotebookTree } from "@/lib/db/tree";
import type { AppSettings, Note, NoteLink, NotebookNode } from "@/lib/db/types";
import { QUERY_KEYS } from "./query-keys";

/* Read hooks only. Mutations live in `mutations.ts`; components never call a
 * repository directly from an event handler without going through both. */

export function useSettings(): UseQueryResult<AppSettings> {
  return useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: getSettings,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useNotebookTree(): UseQueryResult<NotebookNode[]> {
  return useQuery({
    queryKey: QUERY_KEYS.notebooks,
    queryFn: async () => {
      const [notebooks, counts] = await Promise.all([listNotebooks(), noteCountsByNotebook()]);
      return buildNotebookTree(notebooks, counts);
    },
  });
}

export interface NoteListQuery {
  notebookId?: string | null;
  includeTrashed?: boolean;
}

export function useNotes({ notebookId, includeTrashed = false }: NoteListQuery = {}): UseQueryResult<Note[]> {
  return useQuery({
    queryKey: QUERY_KEYS.notes(notebookId ?? null, includeTrashed),
    queryFn: () => listNotes({ notebookId, includeTrashed }),
  });
}

export function useTrashedNotes(): UseQueryResult<Note[]> {
  return useQuery({
    queryKey: QUERY_KEYS.trash,
    queryFn: listTrashedNotes,
  });
}

/** Every attachment in the workspace, metadata only. */
export function useAttachments(): UseQueryResult<AttachmentSummary[]> {
  return useQuery({
    queryKey: QUERY_KEYS.attachments,
    queryFn: listAllAttachments,
  });
}

/** Notes that link to this one. */
export function useBacklinks(noteId: string): UseQueryResult<Note[]> {
  return useQuery({
    queryKey: QUERY_KEYS.backlinks(noteId),
    queryFn: () => backlinksFor(noteId),
    enabled: noteId !== "",
  });
}

/** This note's outgoing links, resolved and unresolved. */
export function useOutgoingLinks(noteId: string): UseQueryResult<NoteLink[]> {
  return useQuery({
    queryKey: QUERY_KEYS.outgoingLinks(noteId),
    queryFn: () => outgoingLinks(noteId),
    enabled: noteId !== "",
  });
}

/**
 * Link counts for the visible list.
 *
 * Keyed on the sorted id list so re-sorting the same notes does not refetch,
 * but adding or removing a note does.
 */
export function useLinkCounts(noteIds: string[]): Map<string, { outgoing: number; incoming: number }> {
  const key = [...noteIds].sort().join(",");

  const { data } = useQuery({
    queryKey: QUERY_KEYS.linkCounts(key),
    queryFn: () => linkCounts(noteIds),
    enabled: noteIds.length > 0,
  });

  return data ?? new Map();
}

/** Invalidate everything that reads notes. Coarse on purpose — the write paths
 *  touch notes, tags, versions and settings, and a stale sidebar is worse than
 *  an extra refetch. */
export function useInvalidateAll() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}
