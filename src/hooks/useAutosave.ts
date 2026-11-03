"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { SaveStatus } from "@/lib/db/types";
import { docToText, toMarkdown } from "@/lib/tiptap/markdown";
import {
  peekPendingSave,
  stashPendingSave,
  takePendingSave,
} from "@/lib/editor/pending-saves";

/** Debounce for autosave. Long enough to coalesce typing, short enough that a
 *  note switch never feels like it lost work. */
export const AUTOSAVE_DEBOUNCE_MS = 800;

export interface AutosavePayload {
  title: string;
  doc: JSONContent;
}

/** The subset of the save mutation this hook needs. */
export interface AutosaveWriter {
  mutateAsync: (input: {
    id: string;
    patch: {
      title: string;
      contentJson: JSONContent;
      contentMarkdown: string;
      contentText: string;
    };
  }) => Promise<unknown>;
}

export interface Autosave {
  status: SaveStatus;
  /** Record an edit and (re)start the debounce. */
  queue: (payload: AutosavePayload) => void;
  /** Persist immediately — used by Retry, tab hide and unmount. */
  flush: () => Promise<void>;
}

/**
 * Debounced save for one note.
 *
 * The pending payload lives in `lib/editor/pending-saves` rather than a ref so
 * that a save rejected while the editor is unmounting can still be retried by
 * the next mount. The hook is keyed by note id at the call site, so `noteId`
 * does not change during its lifetime.
 */
export function useAutosave(noteId: string, writer: AutosaveWriter): Autosave {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writerRef = useRef(writer);

  useEffect(() => {
    writerRef.current = writer;
  }, [writer]);

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    const payload = takePendingSave(noteId);
    if (payload === undefined) return;

    setStatus("saving");
    try {
      await writerRef.current.mutateAsync({
        id: noteId,
        patch: {
          title: payload.title,
          contentJson: payload.doc,
          contentMarkdown: toMarkdown(payload.doc),
          contentText: docToText(payload.doc),
        },
      });
      setStatus("saved");
    } catch {
      // Put it back so the next flush — or the next mount of this note —
      // retries instead of dropping the edit.
      stashPendingSave(noteId, payload);
      setStatus("error");
    }
  }, [noteId]);

  const queue = useCallback(
    (payload: AutosavePayload) => {
      stashPendingSave(noteId, payload);
      setStatus("saving");
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
    },
    [flush, noteId],
  );

  // A payload can survive an unmount when the save that was in flight failed.
  // Retry it as soon as the note is opened again. The effect only schedules
  // work — no synchronous setState, which the React Compiler lint rule rejects.
  useEffect(() => {
    if (peekPendingSave(noteId) === undefined) return;
    const id = setTimeout(() => void flush(), 0);
    return () => clearTimeout(id);
  }, [flush, noteId]);

  // A tab close or a backgrounded tab must not lose the in-flight edit.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      // Unmounting flushes too — this is the note-switch path.
      void flush();
    };
  }, [flush]);

  return { status, queue, flush };
}
