/**
 * Content comparison for the sync engine.
 *
 * `content_json` is Postgres `jsonb`, which does not preserve the key order it
 * was given: it stores keys sorted by length, then bytewise. TipTap emits
 * `{type, text}` while a round-tripped row comes back as `{text, type}`, so a
 * plain `JSON.stringify` comparison called every pulled note a conflict,
 * wrote a duplicate snapshot and inflated the version counter. Comparing a
 * canonical form removes the false positives without weakening the check.
 */

/** Stable JSON: object keys sorted recursively, arrays keep their order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeys(record[key]);
    }
    return sorted;
  }
  return value;
}

export interface LocalNoteContent {
  title: string;
  contentJson: unknown;
  contentText: string;
  isTrashed: 0 | 1;
}

export interface RemoteNoteContent {
  title: string;
  content_json: unknown;
  content_text: string;
  is_trashed: boolean;
}

/** Does the remote copy actually carry different content from local? */
export function noteContentDiffers(
  local: LocalNoteContent,
  remote: RemoteNoteContent,
): boolean {
  return (
    local.title !== remote.title ||
    local.contentText !== remote.content_text ||
    local.isTrashed !== (remote.is_trashed ? 1 : 0) ||
    canonicalJson(local.contentJson) !== canonicalJson(remote.content_json)
  );
}
