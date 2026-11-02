/** Display formatting. Pure, so it is cheap to test and reuse. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now" / "12m" / "3h" / "5d" / "14 Mar" — for dense list rows. */
export function relativeTime(timestamp: number, now = Date.now()): string {
  const delta = now - timestamp;

  if (delta < 0) return "just now";
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)}d`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** First non-empty line of body text, clipped for a list row. */
/**
 * A one-line preview of a note body.
 *
 * `[[wiki links]]` are flattened to their display text. The brackets are
 * storage syntax, not prose, and a list of notes reading "[[Reading list]]
 * Roadmap" looks like a bug to anyone who did not type it. The stored
 * `contentText` keeps the brackets — the link index is derived from it — so
 * this is a presentation concern and only a presentation concern.
 *
 * When a `title` is given, a first line that merely repeats it (or is a prefix
 * of it — "Welcome" under "Welcome to your notes") is dropped: the row already
 * shows the title, and echoing it back looks like duplicated content.
 */
export function preview(contentText: string, max = 120, title?: string): string {
  const lines = contentText
    .replace(/\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g, (_all, title: string, alias: string) =>
      (alias ?? title).trim(),
    )
    .split("\n")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (title !== undefined && lines.length > 0) {
    const normalizedTitle = normalizeForCompare(title);
    const first = normalizeForCompare(lines[0]);
    if (
      normalizedTitle !== "" &&
      first !== "" &&
      (first === normalizedTitle ||
        normalizedTitle.startsWith(first) ||
        first.startsWith(normalizedTitle))
    ) {
      lines.shift();
    }
  }

  const line = lines[0] ?? "";
  if (line === "") return "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Case- and punctuation-insensitive comparison for title vs first line. */
function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
