/**
 * Browser storage is *evictable*. Under disk pressure the browser can delete
 * an origin's IndexedDB with no warning and no chance to intercept it. These
 * helpers are the difference between "the user's notes vanished" and "the
 * browser cleared them and the app said so".
 */

export interface StorageUsage {
  /** Bytes in use by this origin. */
  usage: number;
  /** Bytes available to this origin. */
  quota: number;
  /** `usage / quota`, 0..1. `null` when the browser will not report. */
  ratio: number | null;
  /** True once the browser has granted eviction protection. */
  persisted: boolean;
  /** False when the Storage API is entirely unavailable (private mode, SSR). */
  supported: boolean;
}

const UNKNOWN: StorageUsage = {
  usage: 0,
  quota: 0,
  ratio: null,
  persisted: false,
  supported: false,
};

export function storageSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.estimate === "function"
  );
}

export async function getStorageUsage(): Promise<StorageUsage> {
  if (!storageSupported()) return UNKNOWN;

  try {
    const [estimate, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted?.() ?? Promise.resolve(false),
    ]);

    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;

    return {
      usage,
      quota,
      ratio: quota > 0 ? usage / quota : null,
      persisted,
      supported: true,
    };
  } catch {
    // A throwing estimate() is not a reason to break settings.
    return UNKNOWN;
  }
}

/**
 * Ask the browser to stop evicting this origin. Best-effort: the browser may
 * refuse, and some refuse silently. Always surface the result to the user
 * rather than assuming success.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export class StorageQuotaError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "StorageQuotaError";
    this.cause = cause;
  }
}

export function isQuotaError(error: unknown): boolean {
  if (error instanceof StorageQuotaError) return true;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "QuotaExceededError" || error.code === 22;
  }
  if (typeof error === "object" && error !== null && "name" in error) {
    return (error as { name?: unknown }).name === "QuotaExceededError";
  }
  return false;
}

/**
 * Run a write, converting a quota failure into a `StorageQuotaError` the UI
 * can report. A write must never fail silently.
 */
export async function guardedWrite<T>(label: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isQuotaError(error)) {
      throw new StorageQuotaError(
        `Browser storage is full — could not ${label}. Export a backup, then free space or remove large attachments.`,
        error,
      );
    }
    throw error;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}
