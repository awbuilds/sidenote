"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { seedIfEmpty } from "@/lib/seed/seed";
import { getStorageUsage, requestPersistence, type StorageUsage } from "@/lib/storage/quota";
import { QUERY_KEYS } from "./query-keys";

export type BootstrapState = "loading" | "ready" | "error";

export interface BootstrapResult {
  state: BootstrapState;
  error: Error | null;
  /** True when sample content was created on this load. */
  seeded: boolean;
  storage: StorageUsage | null;
  retry: () => void;
}

/**
 * First-load bootstrap.
 *
 * Seeds sample content when the database is empty, and asks the browser to
 * protect this origin from eviction. Both are best-effort: a failure here must
 * show a retry rather than an empty app, because a blocked IndexedDB (private
 * mode, disabled storage) is recoverable and a silent empty database is not.
 */
export function useBootstrap(): BootstrapResult {
  const client = useQueryClient();
  const [state, setState] = useState<BootstrapState>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await seedIfEmpty();
        if (cancelled) return;
        setSeeded(result !== null);
        if (result !== null) {
          // The settings query is typically mounted before the seed finishes,
          // so its cached default would hide the pending onboarding flag.
          await client.invalidateQueries({ queryKey: QUERY_KEYS.settings });
          await client.invalidateQueries({ queryKey: QUERY_KEYS.samplePreview });
        }

        // Ask once, then read. `persist()` is a user-trust signal the browser
        // may decline; we surface the answer rather than assuming it.
        await requestPersistence();
        const usage = await getStorageUsage();
        if (cancelled) return;
        setStorage(usage);

        setState("ready");
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, client]);

  // Reset lives in the click handler, not the effect body — setting state
  // synchronously inside an effect causes a cascading render.
  const retry = useCallback(() => {
    setError(null);
    setState("loading");
    setAttempt((n) => n + 1);
  }, []);

  return {
    state,
    error,
    seeded,
    storage,
    retry,
  };
}
