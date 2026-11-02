"use client";

import type { Editor } from "@tiptap/react";

/**
 * Image insertion from the toolbar.
 *
 * Routed through the same compress-then-store path as a paste or a drop, so an
 * image pasted, dropped or picked all end up identical — including the WebP
 * re-encode and the 5 MB ceiling.
 */
export async function showImagePicker(editor: Editor): Promise<void> {
  if (typeof document === "undefined") return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/avif";
  input.multiple = true;

  input.onchange = async () => {
    const files = [...(input.files ?? [])];
    input.remove();
    if (files.length === 0) return;

    const { insertAttachments } = await import("@/hooks/useAttachmentIngest");
    await insertAttachments(editor, files, currentNoteId(editor));
  };

  input.click();
}

/**
 * The note being edited.
 *
 * Stashed on the editor by `NoteEditor` so toolbar actions that have no note
 * prop can still reach it, rather than threading the id through every
 * intermediate component.
 */
const NOTE_ID = "sidenote:noteId";

export function setCurrentNoteId(editor: Editor, noteId: string): void {
  (editor as unknown as Record<string, unknown>)[NOTE_ID] = noteId;
}

export function currentNoteId(editor: Editor): string {
  const id = (editor as unknown as Record<string, unknown>)[NOTE_ID];
  return typeof id === "string" ? id : "";
}