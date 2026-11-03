/**
 * How healthy the user's only durable copy is.
 *
 * The README calls browser eviction "the one real risk", and a backup the user
 * took three months ago is not protection against it. The settings screen used
 * to render nothing at all, and the first-run checklist counted any export
 * ever made as done. This is the one place that answers the question.
 */

export type BackupState = "none" | "stale" | "fresh";

export interface BackupHealth {
  state: BackupState;
  /** Whole days since the last export, or null when there has never been one. */
  daysSince: number | null;
  /** Writes since that export, when the export recorded a data version. */
  changesSince: number | null;
}

export const BACKUP_STALE_DAYS = 7;
export const BACKUP_STALE_CHANGES = 25;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupInput {
  lastBackupAt: number | null;
  lastBackupDataVersion: number | null;
  dataVersion: number;
}

export function backupHealth(settings: BackupInput, now = Date.now()): BackupHealth {
  if (settings.lastBackupAt === null) {
    return { state: "none", daysSince: null, changesSince: null };
  }

  const daysSince = Math.max(0, Math.floor((now - settings.lastBackupAt) / DAY_MS));
  const changesSince =
    settings.lastBackupDataVersion === null
      ? null
      : Math.max(0, settings.dataVersion - settings.lastBackupDataVersion);

  const stale =
    daysSince >= BACKUP_STALE_DAYS || (changesSince ?? 0) >= BACKUP_STALE_CHANGES;

  return { state: stale ? "stale" : "fresh", daysSince, changesSince };
}
