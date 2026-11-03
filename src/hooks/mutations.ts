"use client";

import { useCallback } from "react";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createNotebook,
  deleteNotebook,
  moveNotebook,
  renameNotebook,
  reorderNotebooks,
  NotebookCycleError,
  type DeleteNotebookStrategy,
} from "@/lib/db/repositories/notebooks";
import {
  createNote,
  createVersion,
  moveNotes,
  purgeNotes,
  renameNote,
  restoreNotes,
  restoreVersion,
  saveNoteContent,
  togglePin,
  trashNotes,
  emptyTrash,
  NoteMissingError,
  type ContentPatch,
} from "@/lib/db/repositories/notes";
import { createTag, deleteTag, pruneUnusedTags, renameTag, setNoteTags, updateTagColor } from "@/lib/db/repositories/tags";
import { addAttachment, deleteAttachment, type NewAttachment } from "@/lib/db/repositories/attachments";
import { setSetting, updateSettings } from "@/lib/db/repositories/settings";
import { removeSampleData, wipeAllData } from "@/lib/seed/seed";
import { requestSync } from "@/lib/sync/trigger";
import { QUERY_FAMILIES, QUERY_KEYS } from "./query-keys";
import { isQuotaError } from "@/lib/storage/quota";
import type { AppSettings, Note, NoteId, NotebookId, TagId } from "@/lib/db/types";

/* Every write goes through here. Components never call a repository directly —
 * that is what keeps query invalidation consistent and what will make the
 * backend swap a change of implementation rather than of call sites. */

type KeyFamily = readonly unknown[];

/**
 * Invalidate exactly the families a write touched.
 *
 * The previous version invalidated `notes`, `note`, `notebooks`, `settings`
 * and a `search` key that no query ever registered, after every write. With
 * `staleTime: Infinity` that meant an autosave refetched every note row (bodies
 * included) while the one family that actually changed — `tags` — was never
 * invalidated at all. Naming the families per mutation fixes both.
 */
function useInvalidate() {
  const client = useQueryClient();
  return useCallback(
    async (...families: KeyFamily[]) => {
      await Promise.all(
        families.map((queryKey) => client.invalidateQueries({ queryKey })),
      );
      // Any local write may need pushing. Debounced and a no-op without a
      // configured remote, so this costs nothing in the local-only case.
      requestSync();
    },
    [client],
  );
}

/** Turn any thrown error into a toast. Quota failures get their own copy. */
function reportError(error: unknown, fallback: string): void {
  if (isQuotaError(error)) {
    toast.error("Browser storage is full", {
      description:
        "Export a backup from Settings, then free up space or remove large attachments.",
    });
    return;
  }
  if (error instanceof NotebookCycleError) {
    toast.error("That move is not allowed", {
      description: "A notebook cannot be moved inside itself.",
    });
    return;
  }
  if (error instanceof NoteMissingError) {
    toast.error("That note no longer exists");
    return;
  }
  toast.error(fallback, { description: error instanceof Error ? error.message : undefined });
}

/* ------------------------------------------------------------------ */
/* Notebooks                                                           */
/* ------------------------------------------------------------------ */

export function useCreateNotebook() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { name: string; parentId?: NotebookId | null }) => createNotebook(input),
    onSuccess: async () => {
      await invalidate(QUERY_FAMILIES.notebooks, QUERY_FAMILIES.notes);
      toast.success("Notebook created");
    },
    onError: (error) => reportError(error, "Could not create the notebook"),
  });
}

export function useRenameNotebook() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: NotebookId; name: string }) => renameNotebook(input.id, input.name),
    onSuccess: () => invalidate(QUERY_FAMILIES.notebooks),
    onError: (error) => reportError(error, "Could not rename the notebook"),
  });
}

export function useMoveNotebook() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: NotebookId; parentId: NotebookId | null; position?: number }) =>
      moveNotebook(input.id, input.parentId, input.position),
    // A refused move is a normal outcome, not an error to shout about — the
    // user learns why through the message and nothing changes.
    onError: (error) => {
      if (error instanceof NotebookCycleError) {
        toast.error("Cannot move a notebook inside itself");
        return;
      }
      reportError(error, "Could not move the notebook");
    },
    onSuccess: () => invalidate(QUERY_FAMILIES.notebooks),
  });
}

export function useReorderNotebooks() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { parentId: NotebookId | null; orderedIds: NotebookId[] }) =>
      reorderNotebooks(input.parentId, input.orderedIds),
    onError: (error) => reportError(error, "Could not reorder notebooks"),
    onSuccess: () => invalidate(QUERY_FAMILIES.notebooks),
  });
}

export function useDeleteNotebook() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: NotebookId; strategy?: DeleteNotebookStrategy }) =>
      deleteNotebook(input.id, input.strategy ?? "trashNotes"),
    onSuccess: async () => {
      await invalidate(QUERY_FAMILIES.notebooks, QUERY_FAMILIES.notes, QUERY_FAMILIES.links);
      toast.success("Notebook deleted", { description: "Its notes were moved to the trash." });
    },
    onError: (error) => reportError(error, "Could not delete the notebook"),
  });
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

export function useCreateNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (
      input: {
        notebookId?: NotebookId | null;
        title?: string;
        contentJson?: Note["contentJson"];
        contentMarkdown?: string;
        contentText?: string;
      } = {},
    ) => createNote(input),
    onSuccess: async (note) => {
      await invalidate(QUERY_FAMILIES.notes, QUERY_FAMILIES.notebooks);
      return note;
    },
    onError: (error) => reportError(error, "Could not create the note"),
  });
}

export function useSaveNoteContent() {
  const invalidate = useInvalidate();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: NoteId; patch: ContentPatch }) =>
      saveNoteContent(input.id, input.patch),
    onError: (error) => reportError(error, "Could not save the note"),
    // The list needs the new preview, title and timestamp, but refetching it
    // on every autosave is what made typing cost a full read of the library.
    // The pane sorts and groups in the browser, so patching the cached rows in
    // place is enough.
    onSuccess: async (note) => {
      // The `notes` family also holds a numeric count and a title index, so
      // only arrays are patched.
      client.setQueriesData<Note[]>({ queryKey: QUERY_FAMILIES.notes }, (rows) =>
        Array.isArray(rows)
          ? rows.map((row) => (row.id === note.id ? note : row))
          : rows,
      );
      client.setQueryData(QUERY_KEYS.note(note.id), note);
      await invalidate(QUERY_FAMILIES.links);
    },
  });
}

export function useRenameNote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: NoteId; title: string }) => renameNote(input.id, input.title),
    onError: (error) => reportError(error, "Could not rename the note"),
    onSuccess: () => invalidate(QUERY_FAMILIES.notes, QUERY_FAMILIES.note, QUERY_FAMILIES.links),
  });
}

export function useTogglePin() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: NoteId) => togglePin(id),
    onError: (error) => reportError(error, "Could not pin the note"),
    onSuccess: () => invalidate(QUERY_FAMILIES.notes, QUERY_FAMILIES.note),
  });
}

export function useMoveNotes() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { ids: NoteId[]; notebookId: NotebookId | null }) =>
      moveNotes(input.ids, input.notebookId),
    onError: (error) => reportError(error, "Could not move the notes"),
    onSuccess: () => invalidate(QUERY_FAMILIES.notes, QUERY_FAMILIES.notebooks),
  });
}

export function useTrashNotes() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (ids: NoteId[]) => trashNotes(ids),
    onSuccess: async () => {
      await invalidate(QUERY_FAMILIES.notes, QUERY_FAMILIES.notebooks, QUERY_FAMILIES.links);
      toast.success("Moved to trash");
    },
    onError: (error) => reportError(error, "Could not move to trash"),
  });
}

export function useRestoreNotes() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (ids: NoteId[]) => restoreNotes(ids),
    onSuccess: async () => {
      await invalidate(QUERY_FAMILIES.notes, QUERY_FAMILIES.notebooks, QUERY_FAMILIES.links);
      toast.success("Note restored");
    },
    onError: (error) => reportError(error, "Could not restore the note"),
  });
}

export function usePurgeNotes() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (ids: NoteId[]) => purgeNotes(ids),
    onSuccess: async () => {
      await invalidate(QUERY_FAMILIES.notes, QUERY_FAMILIES.notebooks, QUERY_FAMILIES.tags, QUERY_FAMILIES.links, QUERY_FAMILIES.attachments);
      toast.success("Permanently deleted");
    },
    onError: (error) => reportError(error, "Could not delete permanently"),
  });
}

export function useEmptyTrash() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => emptyTrash(),
    onSuccess: async () => {
      await invalidate(QUERY_FAMILIES.notes, QUERY_FAMILIES.notebooks, QUERY_FAMILIES.tags, QUERY_FAMILIES.links, QUERY_FAMILIES.attachments);
      toast.success("Trash emptied");
    },
    onError: (error) => reportError(error, "Could not empty the trash"),
  });
}

export function useCreateVersion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { noteId: NoteId; label: string }) =>
      createVersion(input.noteId, input.label),
    onSuccess: async () => {
      await invalidate(QUERY_FAMILIES.note);
      toast.success("Version saved");
    },
    onError: (error) => reportError(error, "Could not save the version"),
  });
}

export function useRestoreVersion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { noteId: NoteId; version: number }) =>
      restoreVersion(input.noteId, input.version),
    onSuccess: async () => {
      await invalidate(QUERY_FAMILIES.note, QUERY_FAMILIES.notes, QUERY_FAMILIES.links);
      toast.success("Version restored");
    },
    onError: (error) => reportError(error, "Could not restore that version"),
  });
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

export function useSetNoteTags() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { noteId: NoteId; names: string[] }) => setNoteTags(input.noteId, input.names),
    onError: (error) => reportError(error, "Could not update tags"),
    onSuccess: () => invalidate(QUERY_FAMILIES.tags, QUERY_FAMILIES.note),
  });
}

export function useCreateTag() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { name: string; color?: string }) => createTag(input.name, input.color),
    onError: (error) => reportError(error, "Could not create the tag"),
    onSuccess: () => invalidate(QUERY_FAMILIES.tags),
  });
}

export function useRenameTag() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: TagId; name: string }) => renameTag(input.id, input.name),
    onError: (error) => reportError(error, "Could not rename the tag"),
    onSuccess: () => invalidate(QUERY_FAMILIES.tags, QUERY_FAMILIES.note),
  });
}

export function useUpdateTagColor() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: TagId; color: string }) => updateTagColor(input.id, input.color),
    onError: (error) => reportError(error, "Could not update the tag color"),
    onSuccess: () => invalidate(QUERY_FAMILIES.tags),
  });
}

export function useDeleteTag() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: TagId) => deleteTag(id),
    onError: (error) => reportError(error, "Could not delete the tag"),
    onSuccess: () => invalidate(QUERY_FAMILIES.tags, QUERY_FAMILIES.note),
  });
}

export function usePruneUnusedTags() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => pruneUnusedTags(),
    onError: (error) => reportError(error, "Could not clean up tags"),
    onSuccess: () => invalidate(QUERY_FAMILIES.tags),
  });
}

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

export function useAddAttachment(): UseMutationResult<
  Awaited<ReturnType<typeof addAttachment>>,
  unknown,
  NewAttachment
> {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: addAttachment,
    onSuccess: () => invalidate(QUERY_FAMILIES.attachments),
    onError: (error) => reportError(error, "Could not attach the file"),
  });
}

export function useDeleteAttachment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onError: (error) => reportError(error, "Could not remove the attachment"),
    onSuccess: () => invalidate(QUERY_FAMILIES.attachments),
  });
}

/* ------------------------------------------------------------------ */
/* Settings and data lifecycle                                         */
/* ------------------------------------------------------------------ */

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => updateSettings(patch),
    onSuccess: async (settings) => {
      await client.invalidateQueries({ queryKey: ["settings"] });
      // Mirror for the pre-paint script, which cannot read IndexedDB.
      // `normalizeTheme` migrates a legacy `amoled` row to `dark`.
      const { normalizeTheme, normalizeThemePack, writeStoredTheme, writeStoredThemePack } =
        await import("@/lib/theme");
      const theme = normalizeTheme(settings.theme);
      if (theme !== null) writeStoredTheme(theme);
      writeStoredThemePack(normalizeThemePack(settings.themePack));
    },
    onError: (error) => reportError(error, "Could not save settings"),
  });
}

export function useRemoveSampleData() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => removeSampleData(),
    onSuccess: async () => {
      await invalidate(QUERY_FAMILIES.notes, QUERY_FAMILIES.notebooks, QUERY_FAMILIES.tags, QUERY_FAMILIES.links, QUERY_FAMILIES.attachments, QUERY_FAMILIES.settings, QUERY_FAMILIES.samplePreview, QUERY_FAMILIES.note);
      toast.success("Sample data removed");
    },
    onError: (error) => reportError(error, "Could not remove the sample data"),
  });
}

export function useWipeAllData() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => wipeAllData(),
    onSuccess: async () => {
      client.clear();
      toast.success("All data deleted", { description: "Reload to start fresh." });
    },
    onError: (error) => reportError(error, "Could not delete your data"),
  });
}

export { setSetting };
