import { db } from "../db";
import type { SearchIndexRow } from "../types";

/**
 * The persisted search index.
 *
 * A repository rather than direct table access so `src/hooks/` keeps its side
 * of the "only `lib/db` talks to Dexie" invariant.
 */
export const SEARCH_INDEX_KEY = "current";

export async function getSearchIndex(): Promise<SearchIndexRow | undefined> {
  return db().searchIndex.get(SEARCH_INDEX_KEY);
}

export async function putSearchIndex(row: SearchIndexRow): Promise<void> {
  await db().searchIndex.put(row);
}

export async function clearSearchIndex(): Promise<void> {
  await db().searchIndex.clear();
}
