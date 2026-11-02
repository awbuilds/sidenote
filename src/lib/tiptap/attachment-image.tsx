"use client";

import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import { useEffect, useRef, useState } from "react";
import { FileWarning } from "lucide-react";
import { acquireUrl, isAttachmentRef, parseAttachmentRef, releaseUrl } from "@/lib/attachments/urls";

/**
 * Image node that can hold a local attachment.
 *
 * The stored `src` is `attachment://<id>`, never a blob URL. Object URLs die
 * with the document, so persisting one would leave a broken image on the next
 * load. The real URL is resolved at render time and reference-counted, so it
 * is revoked exactly when the last view using it unmounts.
 */
function AttachmentImageView({ node, selected }: NodeViewProps) {
  const src = String(node.attrs.src ?? "");
  const attachmentId = parseAttachmentRef(src);
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const held = useRef<string | null>(null);

  useEffect(() => {
    if (attachmentId === null) return;

    let cancelled = false;
    void acquireUrl(attachmentId).then((resolved) => {
      if (cancelled) {
        // Acquired after unmount — hand the reference straight back.
        if (resolved !== null) releaseUrl(attachmentId);
        return;
      }
      if (resolved === null) setMissing(true);
      else {
        setUrl(resolved);
        held.current = attachmentId;
      }
    });

    return () => {
      cancelled = true;
      if (held.current !== null) {
        releaseUrl(held.current);
        held.current = null;
      }
    };
  }, [attachmentId]);

  const alt = String(node.attrs.alt ?? "");
  const title = node.attrs.title === null ? undefined : String(node.attrs.title);

  if (missing) {
    return (
      <NodeViewWrapper
        data-drag-handle=""
        className={`my-2 flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground ${
          selected ? "ring-1 ring-primary/40" : ""
        }`}
      >
        <FileWarning className="size-4 shrink-0" />
        <span>This image is missing from local storage.</span>
      </NodeViewWrapper>
    );
  }

  if (attachmentId !== null && url === null) {
    return (
      <NodeViewWrapper
        data-drag-handle=""
        className="my-2 h-32 w-full max-w-md animate-pulse rounded-lg bg-muted"
      />
    );
  }

  return (
    <NodeViewWrapper
      data-drag-handle=""
      className={`my-2 inline-block max-w-full ${selected ? "ring-2 ring-primary/50" : ""}`}
    >
      {/* A blob URL, not a remote one, so next/image is not appropriate. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url ?? src}
        alt={alt}
        title={title}
        className="max-h-[32rem] w-auto rounded-lg object-contain"
      />
    </NodeViewWrapper>
  );
}

export const AttachmentImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentImageView, { as: "figure" });
  },
});

export { isAttachmentRef };
