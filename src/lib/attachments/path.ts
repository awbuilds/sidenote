/** Free-tier attachment budget. Mirrors `enforce_attachment_quota` in
 *  `supabase/migrations/20261002210000_attachment_sync.sql`. */
export const FREE_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/**
 * Storage object path for an attachment. One folder per user (the storage
 * policy checks the first segment against `auth.uid()`), one per attachment so
 * two files with the same name cannot collide.
 *
 * The server derives this from `(userId, id, fileName)` — the local attachment
 * record does not store a path.
 */
/** Would storing `incomingBytes` more take the account past the budget? */
export function exceedsAttachmentBudget(usedBytes: number, incomingBytes: number): boolean {
  return usedBytes + incomingBytes > FREE_ATTACHMENT_BYTES;
}

export function attachmentStoragePath(userId: string, id: string, fileName: string): string {
  const safeName = fileName.replace(/[/\\]/g, "_") || "file";
  return `${userId}/${id}/${safeName}`;
}
