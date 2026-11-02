"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Pane = "notebooks" | "notes" | "editor" | "attachments";

/** The query-string keys the workspace reads and writes. */
export type UrlParamKey = "notebook" | "note" | "q" | "tag";

/** Sentinel for the "Unfiled" pseudo-notebook. A real id is a UUID, so this
 *  cannot collide with one. */
export const UNFILED = "unfiled";

export interface WorkspaceParams {
  notebookId: string | null;
  noteId: string | null;
  query: string;
  tagId: string | null;
}

/**
 * Workspace state lives in the URL, not in component state, so a note is
 * linkable and survives a reload. Writes use `replace` rather than `push`:
 * switching notes should not stack 50 history entries.
 */
export function useWorkspaceParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params: WorkspaceParams = {
    notebookId: searchParams.get("notebook"),
    noteId: searchParams.get("note"),
    query: searchParams.get("q") ?? "",
    tagId: searchParams.get("tag"),
  };

  const setParam = useCallback(
    (key: UrlParamKey, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const selectNotebook = useCallback(
    (id: string | null) => {
      // Changing notebook invalidates the open note, so clear it.
      const next = new URLSearchParams(searchParams.toString());
      if (id === null) next.delete("notebook");
      else next.set("notebook", id);
      next.delete("note");
      next.delete("q");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const selectNote = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("note", id);
      const query = next.toString();
      router.replace(`${pathname}?${query}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  /**
   * The value to hand `listNotes({ notebookId })`.
   *
   * Three distinct states, which the raw param alone does not express:
   *   absent   -> `undefined` -> every note
   *   "unfiled"-> `null`      -> notes with no notebook
   *   a uuid   -> that id     -> notes in that notebook
   */
  const notebookFilter = useMemo<string | null | undefined>(() => {
    if (params.notebookId === null) return undefined;
    if (params.notebookId === UNFILED) return null;
    return params.notebookId;
  }, [params.notebookId]);

  /**
   * Drop the notebook scope but keep the tag filter. Selecting a tag is a
   * widening action, not a replacement — "this tag, anywhere" is the useful
   * default, and a notebook can be re-added on top.
   */
  const clearNotebook = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("notebook");
    next.delete("note");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  return { params, notebookFilter, setParam, selectNotebook, selectNote, clearNotebook };
}
