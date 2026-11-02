import type { AttachmentId } from "@/lib/db/types";

/**
 * Object URL registry for attachment blobs.
 *
 * Every `URL.createObjectURL` must be matched by a revoke, or the blob stays
 * resident for the life of the document. References are counted so the same
 * attachment can appear in the editor and a preview at the same time, and the
 * URL is only released when the last view unmounts.
 */

const PREFIX = "attachment://";

const urls = new Map<string, string>();
const refs = new Map<string, number>();
const pending = new Map<string, Promise<string | null>>();

export function attachmentRef(id: string): string {
  return `${PREFIX}${id}`;
}

/** The attachment id an `attachment://` src refers to, or null. */
export function parseAttachmentRef(src: string): string | null {
  return src.startsWith(PREFIX) ? src.slice(PREFIX.length) : null;
}

export function isAttachmentRef(src: string): boolean {
  return src.startsWith(PREFIX);
}

async function createUrl(id: AttachmentId): Promise<string | null> {
  const { attachmentBlob, getAttachment } = await import("@/lib/db/repositories/attachments");
  const attachment = await getAttachment(id);
  if (attachment === undefined) return null;
  return URL.createObjectURL(await attachmentBlob(attachment));
}

/** Take a reference to an attachment's object URL. */
export function acquireUrl(id: AttachmentId): Promise<string | null> {
  const existing = urls.get(id);
  if (existing !== undefined) {
    refs.set(id, (refs.get(id) ?? 0) + 1);
    return Promise.resolve(existing);
  }

  const inFlight = pending.get(id);
  if (inFlight !== undefined) {
    refs.set(id, (refs.get(id) ?? 0) + 1);
    return inFlight;
  }

  const promise = createUrl(id)
    .then((url) => {
      pending.delete(id);
      if (url !== null) {
        urls.set(id, url);
        refs.set(id, refs.get(id) ?? 1);
      }
      return url;
    })
    .catch(() => {
      pending.delete(id);
      return null;
    });

  pending.set(id, promise);
  refs.set(id, (refs.get(id) ?? 0) + 1);
  return promise;
}

/** Drop a reference. The URL is revoked when the last one goes. */
export function releaseUrl(id: AttachmentId): void {
  const count = (refs.get(id) ?? 1) - 1;
  if (count > 0) {
    refs.set(id, count);
    return;
  }

  refs.delete(id);
  const url = urls.get(id);
  if (url !== undefined) {
    URL.revokeObjectURL(url);
    urls.delete(id);
  }
}

/** Revoke everything. Used on teardown and by tests. */
export function releaseAll(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  refs.clear();
  pending.clear();
}

/** How many views currently hold each attachment — for leak assertions. */
export function refCounts(): Map<string, number> {
  return new Map(refs);
}

/** Blob URLs for every attachment on a note, for the attachment strip. */
export async function attachmentUrls(
  noteId: string,
): Promise<{ id: string; fileName: string; url: string; mime: string; size: number }[]> {
  const { attachmentBlob, listAttachments } = await import("@/lib/db/repositories/attachments");
  const rows = await listAttachments(noteId);
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      fileName: row.fileName,
      url: URL.createObjectURL(await attachmentBlob(row)),
      mime: row.mime,
      size: row.size,
    })),
  );
}
