"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getSettings } from "@/lib/db/repositories/settings";
import { getNotesByIds, listSearchNotes } from "@/lib/db/repositories/notes";
import {
  SEARCH_INDEX_KEY,
  getSearchIndex,
  putSearchIndex,
} from "@/lib/db/repositories/search";
import { buildDocs, type SearchDoc, type SearchHit } from "@/lib/search/engine";
import { createSearchWorker } from "@/lib/search/worker-client";
import {
  hasSearchWork,
  markSearchFullRebuild,
  subscribeSearchWork,
  takeSearchWork,
} from "@/lib/search/dirty";
import type { WorkerRequest, WorkerResponse } from "@/lib/search/worker";

/** Coalesce a burst of saves into one incremental worker update. */
const WORK_DEBOUNCE_MS = 750;
/** Writing the serialised index is expensive; it does not need to be current. */
const PERSIST_DEBOUNCE_MS = 10_000;

export interface SearchState {
  /** Empty whenever the query is empty — derived, not stored. */
  hits: SearchHit[];
  /** Size of the indexed corpus, not the result count. */
  count: number;
  isReady: boolean;
}

/**
 * Owns the search worker.
 *
 * The serialised index is persisted to IndexedDB alongside the
 * `settings.dataVersion` it was built from. On load it is restored when the
 * version still matches, and rebuilt only when it does not — otherwise every
 * page load would pay the full indexing cost for a library of any size.
 *
 * After that, write paths report what changed (`src/lib/search/dirty`) and
 * only those notes are re-indexed. The previous version reindexed the entire
 * library on every query-cache event, which meant every autosave.
 */
export function useSearch(query: string): SearchState {
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const builtVersion = useRef<number | null>(null);
  const workTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistVersion = useRef<number | null>(null);

  const [hits, setHits] = useState<SearchHit[]>([]);
  const [count, setCount] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const post = useCallback((message: WorkerRequest) => {
    workerRef.current?.postMessage(message);
  }, []);

  const persistNow = useCallback(async () => {
    if (persistTimer.current !== null) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    const { dataVersion } = await getSettings();
    persistVersion.current = dataVersion;
    post({ type: "persist" });
  }, [post]);

  const schedulePersist = useCallback(() => {
    if (persistTimer.current !== null) return;
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      void persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }, [persistNow]);

  const rebuildFull = useCallback(async () => {
    const { dataVersion } = await getSettings();
    const rows = await listSearchNotes();
    builtVersion.current = dataVersion;
    post({ type: "index", docs: buildDocs(rows) });
  }, [post]);

  const boot = useCallback(async () => {
    const { dataVersion } = await getSettings();
    const stored = await getSearchIndex();

    if (stored !== undefined && stored.dataVersion === dataVersion) {
      builtVersion.current = dataVersion;
      post({ type: "restore", serialized: stored.serialized });
      return;
    }

    await rebuildFull();
  }, [post, rebuildFull]);

  const flushWork = useCallback(async () => {
    const work = takeSearchWork();
    if (work === null) return;

    if (work.kind === "full") {
      await rebuildFull();
      return;
    }

    const { dataVersion } = await getSettings();
    const rows = await getNotesByIds(work.ids);
    const found = new Set(rows.map((row) => row.id));
    const removed = new Set(work.removed);
    const docs: SearchDoc[] = [];

    for (const row of rows) {
      if (row.isTrashed) {
        removed.add(row.id);
        continue;
      }
      docs.push({
        id: row.id,
        title: row.title,
        text: row.contentText,
        updatedAt: row.updatedAt,
      });
    }
    for (const id of work.ids) {
      if (!found.has(id)) removed.add(id);
    }

    builtVersion.current = dataVersion;
    post({ type: "update", docs, remove: [...removed] });
  }, [post, rebuildFull]);

  const scheduleWork = useCallback(
    (delay = WORK_DEBOUNCE_MS) => {
      if (workTimer.current !== null) return;
      workTimer.current = setTimeout(() => {
        workTimer.current = null;
        void flushWork();
      }, delay);
    },
    [flushWork],
  );

  /**
   * Safety net for a write path that forgot to report itself: the persisted
   * index's version is the only other signal that content changed.
   */
  const checkDrift = useCallback(async () => {
    if (builtVersion.current === null) return;
    const { dataVersion } = await getSettings();
    if (dataVersion === builtVersion.current) return;
    markSearchFullRebuild();
    scheduleWork(0);
  }, [scheduleWork]);

  useEffect(() => {
    const worker = createSearchWorker();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      if (message.type === "ready") {
        setCount(message.count);
        setIsReady(true);

        if (message.source === "restore" && message.failed) {
          void rebuildFull();
          return;
        }
        if (message.source === "index") schedulePersist();
        // Work can arrive while the worker is still booting; drain it.
        if (hasSearchWork()) scheduleWork(0);
        return;
      }

      if (message.type === "updated") {
        setCount(message.count);
        schedulePersist();
        return;
      }

      if (message.type === "serialized") {
        const version = persistVersion.current;
        if (message.serialized !== "" && message.count > 0 && version !== null) {
          void putSearchIndex({
            key: SEARCH_INDEX_KEY,
            serialized: message.serialized,
            dataVersion: version,
            documentCount: message.count,
          });
        }
        return;
      }

      if (message.type === "results") {
        // Ignore responses that a newer keystroke has already superseded.
        if (message.id !== requestId.current) return;
        setHits(message.hits);
      }
    };

    void boot();

    const unsubscribe = subscribeSearchWork(() => scheduleWork());

    const onVisibility = () => {
      if (document.visibilityState === "hidden") void persistNow();
      else void checkDrift();
    };
    // A navigation or tab close is the last chance to write the index.
    const onPageHide = () => void persistNow();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (workTimer.current !== null) clearTimeout(workTimer.current);
      if (persistTimer.current !== null) clearTimeout(persistTimer.current);
      workTimer.current = null;
      persistTimer.current = null;
      worker.terminate();
      workerRef.current = null;
      setIsReady(false);
    };
  }, [boot, checkDrift, persistNow, rebuildFull, schedulePersist, scheduleWork]);

  useEffect(() => {
    // The effect body does no synchronous setState: it only asks the worker.
    // An empty query needs no round trip, and the returned `hits` is already
    // empty because the value is derived from `query`.
    const trimmed = query.trim();
    if (trimmed === "") return;

    requestId.current += 1;
    post({ type: "query", id: requestId.current, query: trimmed });
  }, [query, isReady, post]);

  return { hits: query.trim() === "" ? [] : hits, count, isReady };
}
