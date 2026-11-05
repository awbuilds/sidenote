"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { isRemoteEnabled } from "@/lib/supabase/config";
import {
  pollSync,
  requestSync,
  runSync,
  setSyncAppliedHandler,
  SYNC_INTERVAL_MS,
} from "@/lib/sync/trigger";

/**
 * Drives sync from outside the UI:
 *  - on sign-in,
 *  - when the tab becomes visible again,
 *  - when the network comes back,
 *  - every 30 seconds while visible,
 *  - and after local mutations (`requestSync`, called from invalidation).
 *
 * Pulled rows bypass TanStack Query, so an applied pass invalidates caches.
 */
export function SyncProvider() {
  const queryClient = useQueryClient();
  const auth = useAuth();

  useEffect(() => {
    if (!isRemoteEnabled()) return;

    setSyncAppliedHandler((result) => {
      if (result.pulled > 0 || result.deleted > 0) {
        void queryClient.invalidateQueries();
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") requestSync(0);
    };
    const onOnline = () => requestSync(0);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") pollSync();
    }, SYNC_INTERVAL_MS);

    return () => {
      setSyncAppliedHandler(null);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [queryClient]);

  useEffect(() => {
    if (auth.status === "signed-in") void runSync();
  }, [auth.status]);

  return null;
}
