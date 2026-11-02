import { db } from "../db";
import { DEFAULT_SETTINGS, type AppSettings } from "../types";

/**
 * Read all settings, filling gaps from defaults. Never throws: a missing or
 * corrupt row falls back rather than blocking the app from starting.
 */
export async function getSettings(): Promise<AppSettings> {
  const rows = await db().settings.toArray();
  const stored = new Map(rows.map((row) => [row.key, row.value]));

  const merged = { ...DEFAULT_SETTINGS } as AppSettings;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    if (stored.has(key)) {
      (merged[key] as AppSettings[typeof key]) = stored.get(key) as AppSettings[typeof key];
    }
  }
  return merged;
}

export async function getSetting<K extends keyof AppSettings>(
  key: K,
): Promise<AppSettings[K]> {
  const row = await db().settings.get(key);
  return row === undefined ? DEFAULT_SETTINGS[key] : (row.value as AppSettings[K]);
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await db().settings.put({ key, value });
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  await db().settings.bulkPut(
    Object.entries(patch).map(([key, value]) => ({ key, value })),
  );
  return getSettings();
}

/** Bump the counter that tells the search index its data is stale. */
export async function touchDataVersion(): Promise<number> {
  const current = await getSetting("dataVersion");
  const next = current + 1;
  await setSetting("dataVersion", next);
  return next;
}

export async function resetSettings(): Promise<void> {
  await db().settings.clear();
}
