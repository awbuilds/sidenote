/**
 * Sync status as an external store, so any component can render it without a
 * context provider and without touching the engine.
 */
export type SyncPhase = "disabled" | "signed-out" | "idle" | "syncing" | "error";

export interface SyncStatus {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  message: string | null;
}

let status: SyncStatus = { phase: "disabled", lastSyncedAt: null, message: null };
const listeners = new Set<() => void>();

export function setSyncStatus(patch: Pick<SyncStatus, "phase"> & Partial<SyncStatus>): void {
  const next: SyncStatus = { ...status, ...patch };
  if (
    next.phase === status.phase &&
    next.lastSyncedAt === status.lastSyncedAt &&
    next.message === status.message
  ) {
    return;
  }
  status = next;
  for (const listener of listeners) listener();
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncStatus(): SyncStatus {
  return status;
}
