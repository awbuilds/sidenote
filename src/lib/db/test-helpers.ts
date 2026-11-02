import { afterEach, beforeEach } from "vitest";
import { NotesDatabase, __setDatabase, db } from "./db";

let sequence = 0;

/**
 * Point the singleton at a throwaway database for the current test.
 *
 * Each test gets a uniquely named database rather than a cleared one, so a
 * schema mismatch or a leaked transaction surfaces as a failure instead of
 * quietly passing because of leftover state.
 *
 * Named `withTestDb`, not `useTestDb` — it calls `beforeEach`/`afterEach` and
 * is not a React hook, despite the vocabulary.
 */
export function withTestDb(): void {
  beforeEach(async () => {
    const name = `test-${++sequence}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const database = new NotesDatabase(name);
    __setDatabase(database);
    await database.open();
  });

  afterEach(async () => {
    try {
      await db().close();
      await db().delete();
    } finally {
      __setDatabase(null);
    }
  });
}
