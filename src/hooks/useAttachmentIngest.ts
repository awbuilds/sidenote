"use client";

import { toast } from "sonner";
import type { Editor } from "@tiptap/react";

import { compressImage } from "@/lib/image/compress";
import { addAttachment, MAX_ATTACHMENT_BYTES } from "@/lib/db/repositories/attachments";
import { attachmentRef } from "@/lib/attachments/urls";
import { isQuotaError, formatBytes } from "@/lib/storage/quota";
import type { NoteId } from "@/lib/db/types";

/**
 * Ingest files into a note.
 *
 * Images are re-encoded to WebP (longest edge 2560px) before being written,
 * because the origin quota is shared by every note and the browser will evict
 * the entire database without warning if we fill it.
 *
 * The document stores `attachment://<id>`, never a blob URL — blob URLs die
 * with the document, so persisting one would leave a broken image on the next
 * load. The real URL is resolved at render time by the image node view.
 */
export async function insertAttachments(
  editor: Editor,
  files: File[],
  noteId: NoteId,
): Promise<number> {
  if (files.length === 0) return 0;

  const inserted: string[] = [];

  for (const file of files) {
    if (!isImage(file)) {
      toast.error(`${file.name} is not an image`, {
        description: "Only images can be embedded. Other file types are not supported yet.",
      });
      continue;
    }

    const compressed = await compressImage(file);
    const blob = compressed.blob;

    if (blob.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`${file.name} is too large`, {
        description: `${formatBytes(blob.size)} exceeds the ${formatBytes(
          MAX_ATTACHMENT_BYTES,
        )} limit even after compression.`,
      });
      continue;
    }

    try {
      const attachment = await addAttachment({
        noteId,
        fileName: file.name,
        mime: blob.type || file.type,
        blob,
        width: compressed.width || null,
        height: compressed.height || null,
      });
      inserted.push(attachmentRef(attachment.id));
    } catch (error) {
      if (isQuotaError(error)) {
        toast.error("Browser storage is full", {
          description:
            "Export a backup from Settings, then free up space or remove large attachments.",
        });
        // Nothing after this will fit either.
        break;
      }
      toast.error(`Could not attach ${file.name}`);
    }
  }

  for (const src of inserted) {
    editor
      .chain()
      .focus()
      .insertContent({ type: "image", attrs: { src, alt: "" } })
      .run();
  }

  return inserted.length;
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Pull files out of a paste or drop event, ignoring plain text. */
export function filesFromTransfer(data: DataTransfer | null): File[] {
  if (data === null) return [];

  if (data.files !== undefined && data.files.length > 0) {
    return [...data.files].filter((file) => file.type.startsWith("image/"));
  }

  if (data.items === undefined) return [];

  return [...data.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && file.type.startsWith("image/"));
}
