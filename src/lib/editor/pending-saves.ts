import type { JSONContent } from "@tiptap/core";
import type { NoteId } from "@/lib/db/types";

/**
 * Edits that have been made but not yet persisted.
 *
 * The autosave payload used to live in a ref inside `NoteEditor`. That is
 * enough while the editor stays mounted, but a failed save during a note
 * switch wrote the retry payload into a ref of a component that was already
 * gone, and the edit was lost. This module owns the payload instead: it
 * outlives the component, so the next mount of the same note can retry it.
 *
 * This is deliberately in-memory. A closed tab cannot be recovered from here;
 * the save path flushes on `pagehide` for that case, and the ZIP backup is the
 * durable answer.
 */

export interface PendingSave {
  title: string;
  doc: JSONContent;
}

const pending = new Map<string, PendingSave>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Remember the latest edit for a note, replacing any older pending payload. */
export function stashPendingSave(noteId: NoteId, payload: PendingSave): void {
  pending.set(noteId, payload);
  notify();
}

/** Read without removing — used by the remount drain. */
export function peekPendingSave(noteId: NoteId): PendingSave | undefined {
  return pending.get(noteId);
}

/** Take ownership of the payload; the caller must stash it again on failure. */
export function takePendingSave(noteId: NoteId): PendingSave | undefined {
  const payload = pending.get(noteId);
  if (payload === undefined) return undefined;
  pending.delete(noteId);
  notify();
  return payload;
}

export function clearPendingSave(noteId: NoteId): void {
  if (pending.delete(noteId)) notify();
}

export function hasPendingSave(noteId: NoteId): boolean {
  return pending.has(noteId);
}

/** Any stranded payload, for the "unsaved changes" indicator. */
export function hasAnyPendingSave(): boolean {
  return pending.size > 0;
}

export function subscribePendingSaves(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam — the module map is process-wide. */
export function __resetPendingSaves(): void {
  pending.clear();
  notify();
}
