import { getSupabase, isRemoteEnabled } from "@/lib/supabase/client";
import { db } from "@/lib/db/db";
import { repairLocalIds } from "@/lib/db/migrate-ids";
import { reconcile } from "./engine";
import { setSyncStatus } from "./status";
import { createSupabaseAdapter } from "./supabase-adapter";
import type { SyncResult } from "./types";

/**
 * Sync scheduling — automatic, like a synced drive.
 *
 *  - local writes push after a short debounce (`requestSync`);
 *  - pulls happen on sign-in, tab focus, reconnect, and a fixed interval while
 *    the tab is visible (`pollSync`);
 *  - repeated failures back off exponentially so a broken instant is not
 *    retried every tick, and "Sync now" clears the wait.
 */
export const SYNC_INTERVAL_MS = 30_000;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 300_000;

let running: Promise<SyncResult | null> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let applied: ((result: SyncResult) => void) | null = null;
let failures = 0;
let blockedUntil = 0;
/** A uuid repair is attempted at most once per page load, so a broken record
 *  cannot bounce the user through reloads forever. */
let repairedThisLoad = false;

const UUID_SYNTAX = /invalid input syntax for type uuid: "([^"]*)"/;

/** The offending value from a Postgres uuid rejection, if this is one. */
export function uuidErrorValue(message: string): string | null {
  return UUID_SYNTAX.exec(message)?.[1] ?? null;
}

function defaultReload(): void {
  if (typeof window !== "undefined") window.location.reload();
}

let reloadPage: () => void = defaultReload;

/** Test seam, mirroring `__setDatabase`: run repairs without navigating. */
export function __setReloadHandler(handler: (() => void) | null): void {
  reloadPage = handler ?? defaultReload;
}

/** Test seam: forget per-load backoff and repair bookkeeping. */
export function __resetSyncTrigger(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  running = null;
  failures = 0;
  blockedUntil = 0;
  repairedThisLoad = false;
}

function jitter(ms: number): number {
  return Math.round(ms * (0.9 + Math.random() * 0.2));
}

function backoffMs(): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, failures - 1), MAX_BACKOFF_MS);
}

export function setSyncAppliedHandler(handler: ((result: SyncResult) => void) | null): void {
  applied = handler;
}

/**
 * A Postgres `uuid` rejection has a known, actionable cause: local sample
 * data (or a restored pre-migration archive) with readable ids. The app
 * repairs it in place — see the catch in `runSync` — so the first-occurrence
 * text is only ever shown if a repair attempt could not run.
 */
function friendlySyncError(error: unknown, repairAttempted: boolean): string {
  const message = error instanceof Error ? error.message : "Sync failed";
  const value = uuidErrorValue(message);
  if (value !== null) {
    return repairAttempted
      ? `A local record still can't sync (id "${value}"). Export a ZIP backup and report this.`
      : "Some local sample data needs a one-time repair — reload the app to finish it.";
  }
  return message;
}

/** One scheduled tick. Skipped while backing off from a failure. */
export function pollSync(): void {
  if (!isRemoteEnabled() || typeof window === "undefined") return;
  if (Date.now() < blockedUntil) return;
  void runSync();
}

/** Debounced request after a local write. */
export function requestSync(delayMs = 1200): void {
  if (!isRemoteEnabled() || typeof window === "undefined") return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    pollSync();
  }, delayMs);
}

/** Explicit user action: clear the backoff and try immediately. */
export async function runSyncNow(): Promise<SyncResult | null> {
  failures = 0;
  blockedUntil = 0;
  return runSync();
}

export async function runSync(): Promise<SyncResult | null> {
  if (running) return running;

  const client = await getSupabase();
  if (!client) {
    setSyncStatus({ phase: "disabled" });
    return null;
  }

  running = (async () => {
    try {
      const { data } = await client.auth.getSession();
      if (!data.session) {
        setSyncStatus({ phase: "signed-out" });
        return null;
      }

      setSyncStatus({ phase: "syncing", message: null });
      const result = await reconcile(createSupabaseAdapter(client, data.session.user.id));
      failures = 0;
      blockedUntil = 0;
      repairedThisLoad = false;
      setSyncStatus({
        phase: "idle",
        lastSyncedAt: Date.now(),
        message: result.warnings[0] ?? null,
      });
      applied?.(result);
      return result;
    } catch (error) {
      // A uuid rejection means local data with readable ids — pre-migration
      // sample data, or an archive restored after the v5 upgrade. The Dexie
      // upgrade never reruns, so repair here, once per load, and reload so
      // every in-memory id (URL, open editor) matches the rewritten rows.
      const raw = error instanceof Error ? error.message : "";
      if (!repairedThisLoad && uuidErrorValue(raw) !== null) {
        repairedThisLoad = true;
        try {
          const repair = await repairLocalIds(db());
          if (repair.remapped + repair.sanitized > 0) {
            setSyncStatus({
              phase: "syncing",
              message: "Repaired local data — reloading to finish.",
            });
            setTimeout(() => reloadPage(), 800);
            return null;
          }
        } catch {
          // The repair failure is not the story; show the sync error below.
        }
      }

      failures += 1;
      blockedUntil = Date.now() + jitter(backoffMs());
      setSyncStatus({
        phase: "error",
        message: friendlySyncError(error, repairedThisLoad),
      });
      return null;
    }
  })();

  try {
    return await running;
  } finally {
    running = null;
  }
}
