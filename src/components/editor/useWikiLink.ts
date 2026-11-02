"use client";

import { useEffect, useRef } from "react";
import { isKnownTitle } from "@/lib/tiptap/wiki-link";
import { useQuery } from "@tanstack/react-query";
import { listNotes } from "@/lib/db/repositories/notes";
import { setKnownTitles } from "@/lib/tiptap/wiki-link";

/**
 * The set of note titles, for resolving `[[wiki links]]`.
 *
 * All titles are loaded once and kept in a Set behind a ref, because the link
 * decoration is rebuilt on every keystroke and must not hit the database on
 * each one. A ref rather than state: the decoration reads it from inside a
 * ProseMirror transaction, where a React state read would be one render stale.
 */
export function useTitleResolver(): {
  /** Whether a title names an existing note. Safe to call during a transaction. */
  resolved: (title: string) => boolean;
  /** Every real title, sorted, for the link picker. */
  titles: string[];
  /** Lowercased title -> note id, for navigating a clicked link. */
  idFor: (title: string) => string | null;
  /**
   * True once the title set has actually loaded.
   *
   * The refresh that re-styles links must wait for this. Dispatching a
   * transaction from the editor's own mount effect runs inside
   * `applyTransaction` and throws "Applying a mismatched transaction", which
   * took down every note open.
   */
  ready: boolean;
} {
  const { data } = useQuery({
    queryKey: ["notes", "titles"],
    queryFn: () => listNotes(),
    // Titles are needed by every note, so this is deliberately not scoped to
    // one. Short stale time: a note created in another tab should start
    // resolving soon.
    staleTime: 5_000,
  });

  const notes = data;
  const byTitle = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const live = notes ?? [];
    // Published to the module so the extension can read it while building
    // decorations. Ref-counted nowhere — there is exactly one app-wide title
    // set, and the editor is not constructed until this has run.
    setKnownTitles(live.map((note) => note.title));
    // First note wins a duplicate title, matching how links resolve in the
    // database — otherwise the editor and the link index could disagree about
    // which of two same-named notes a link means.
    const map = new Map<string, string>();
    for (const note of live) {
      const title = note.title.trim().toLowerCase();
      if (title !== "" && !map.has(title)) map.set(title, note.id);
    }
    byTitle.current = map;
  }, [notes]);

  return {
    resolved: isKnownTitle,
    titles: (notes ?? [])
      .map((note) => note.title.trim())
      .filter((title) => title !== "")
      .sort((a, b) => a.localeCompare(b)),
    idFor: (title: string) => byTitle.current.get(title.trim().toLowerCase()) ?? null,
    ready: notes !== undefined,
  };
}
