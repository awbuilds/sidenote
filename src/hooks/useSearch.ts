"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/db/db";
import { fromNoteRow } from "@/lib/db/convert";
import { getSettings } from "@/lib/db/repositories/settings";
import { buildDocs, type SearchHit } from "@/lib/search/engine";
import type { WorkerRequest, WorkerResponse } from "@/lib/search/worker";

const INDEX_KEY = "current";

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
 * The serialized index is persisted to IndexedDB alongside the
 * `settings.dataVersion` it was built from. On load it is restored when the
 * version still matches, and rebuilt only when it does not — otherwise every
 * page load would pay the full indexing cost for a library of any size.
 */
export function useSearch(query: string): SearchState {
  const client = useQueryClient();
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);

  const [hits, setHits] = useState<SearchHit[]>([]);
  const [count, setCount] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const post = useCallback((message: WorkerRequest) => {
    workerRef.current?.postMessage(message);
  }, []);

  /** Restore a matching index, otherwise rebuild from the notes table. */
  const reindex = useCallback(async () => {
    const { dataVersion } = await getSettings();
    const stored = await db().searchIndex.get(INDEX_KEY);

    if (stored !== undefined && stored.dataVersion === dataVersion) {
      post({ type: "restore", serialized: stored.serialized });
      return;
    }

    const rows = await db().notes.where("isTrashed").equals(0).toArray();
    post({ type: "index", docs: buildDocs(rows.map(fromNoteRow)) });
  }, [post]);

  useEffect(() => {
    const worker = new Worker(new URL("../lib/search/worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      if (message.type === "ready") {
        setCount(message.count);
        setIsReady(true);
        // Persist whatever the worker just built, stamped with the version it
        // reflects. Only worth writing when the corpus is non-trivial.
        if (message.serialized !== "" && message.count > 0) {
          void getSettings().then(({ dataVersion }) => {
            void db().searchIndex.put({
              key: INDEX_KEY,
              serialized: message.serialized,
              dataVersion,
              documentCount: message.count,
            });
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

    void reindex();

    return () => {
      worker.terminate();
      workerRef.current = null;
      setIsReady(false);
    };
  }, [reindex]);

  // Note content changed — the stored index is now stale.
  useEffect(() => {
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      const key = event.query?.queryKey[0];
      if (key !== "notes" && key !== "note") return;
      void reindex();
    });
    return () => unsubscribe();
  }, [client, reindex]);

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
