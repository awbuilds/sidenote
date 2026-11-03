/**
 * When a save is worth keeping as history.
 *
 * Autosave fires 800 ms after every typing pause. Snapshotting each of those
 * made "version history" a record of the last thirty pauses — roughly a few
 * minutes of writing — while the settings copy promised a ninety-day floor
 * that could never be reached. The policy below keeps a snapshot on the first
 * edit, on a rename, and at most once per interval; the editor also offers an
 * explicit "save a version" for a checkpoint the user names.
 */

/** Minimum gap between automatic snapshots of an actively edited note. */
export const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

/** Named versions are user intent, so age does not prune them. Count still does. */
export const MANUAL_VERSION_LIMIT = 100;

export interface SnapshotPolicyInput {
  /** Whether the note has any history row yet. */
  hasHistory: boolean;
  previousTitle: string;
  nextTitle: string;
  /** `createdAt` of the newest snapshot, or null when there is none. */
  lastSnapshotAt: number | null;
  now: number;
}

export function shouldSnapshot(input: SnapshotPolicyInput): boolean {
  if (!input.hasHistory) return true;
  if (input.previousTitle.trim() !== input.nextTitle.trim()) return true;
  if (input.lastSnapshotAt === null) return true;
  return input.now - input.lastSnapshotAt >= AUTO_SNAPSHOT_INTERVAL_MS;
}

/**
 * The version number to write a snapshot at.
 *
 * A sync pull can move `notes.version` backwards (last-write-wins has no
 * notion of a local counter), and the history table has a unique
 * `[noteId+version]` index. Deriving the number from the history as well as
 * the note makes a collision impossible: the snapshot always takes a number
 * the note has never used, and the note continues from there.
 */
export function nextSnapshotVersion(
  noteVersion: number,
  highestHistoryVersion: number,
): number {
  return Math.max(noteVersion, highestHistoryVersion + 1);
}
