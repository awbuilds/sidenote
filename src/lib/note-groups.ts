export type NoteGroupKey = "pinned" | "today" | "yesterday" | "week" | "older";

export interface NoteGroup<T> {
  key: NoteGroupKey;
  label: string;
  notes: T[];
}

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Group notes into the date buckets a notes app is expected to show. Only
 * meaningful when the list is sorted by last edit; callers keep other sorts
 * flat.
 */
export function groupNotesByDate<T extends { isPinned: boolean; updatedAt: number }>(
  notes: T[],
  pinnedFirst: boolean,
  now = Date.now(),
): NoteGroup<T>[] {
  const pinned: T[] = [];
  const buckets: Record<Exclude<NoteGroupKey, "pinned">, T[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };

  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - DAY_MS;
  const weekStart = todayStart - 6 * DAY_MS;

  for (const note of notes) {
    if (pinnedFirst && note.isPinned) {
      pinned.push(note);
      continue;
    }
    if (note.updatedAt >= todayStart) buckets.today.push(note);
    else if (note.updatedAt >= yesterdayStart) buckets.yesterday.push(note);
    else if (note.updatedAt >= weekStart) buckets.week.push(note);
    else buckets.older.push(note);
  }

  const groups: NoteGroup<T>[] = [];
  if (pinned.length > 0) groups.push({ key: "pinned", label: "Pinned", notes: pinned });
  if (buckets.today.length > 0) groups.push({ key: "today", label: "Today", notes: buckets.today });
  if (buckets.yesterday.length > 0) {
    groups.push({ key: "yesterday", label: "Yesterday", notes: buckets.yesterday });
  }
  if (buckets.week.length > 0) {
    groups.push({ key: "week", label: "Previous 7 days", notes: buckets.week });
  }
  if (buckets.older.length > 0) groups.push({ key: "older", label: "Earlier", notes: buckets.older });
  return groups;
}
