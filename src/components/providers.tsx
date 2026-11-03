"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { markAppReady } from "@/lib/app-boot";
import { ThemeProvider } from "./providers/theme-provider";
import { SyncProvider } from "./sync/SyncProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { CompanionLayer } from "@/components/companion/CompanionLayer";

/**
 * TanStack Query against IndexedDB.
 *
 * `staleTime: Infinity` throughout — there is no background refetch for a local
 * database, so data is only ever re-read when a mutation invalidates it.
 * `refetchOnWindowFocus` is off for the same reason: refocusing the window
 * should not re-query storage.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });
}

/**
 * Fires the boot signal once the shell is live.
 *
 * Mounting this component means the query client and theme provider exist and
 * the first client render has committed, which is the point at which the
 * splash has nothing left to cover. It deliberately does *not* wait for data:
 * the panes render their own skeletons, and holding a full-screen overlay over
 * readable content would only make the app feel slower.
 */
function AppReadySignal() {
  useEffect(() => {
    // After paint, so the first frame the user sees is the app and not the
    // splash swapping out underneath them.
    const frame = requestAnimationFrame(() => markAppReady());
    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={client}>
      <AppReadySignal />
      <SyncProvider />
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position="bottom-right" richColors closeButton />
        <CompanionLayer />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
