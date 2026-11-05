"use client";

import Link from "next/link";
import {
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudOff,
  RefreshCw,
  Settings2,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useOnline } from "@/hooks/use-online";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { relativeTime } from "@/lib/format";
import { isRemoteEnabled } from "@/lib/supabase/config";
import { syncIconState, type SyncIconState } from "@/lib/sync/icon-state";
import { runSyncNow, SYNC_INTERVAL_MS } from "@/lib/sync/trigger";
import { cn } from "@/lib/utils";

const TITLES: Record<Exclude<SyncIconState, "hidden">, string> = {
  "signed-out": "Not syncing — sign in",
  offline: "Offline — changes will sync later",
  syncing: "Syncing…",
  saved: "All changes saved",
  error: "Can't sync right now",
};

/**
 * Drive-style sync status: one face in the chrome, details in a popover.
 * Placement lives in the sidebar header, the mobile pane headers, and the
 * collapsed icon rail.
 */
export function SyncStatusButton({ variant = "icon" }: { variant?: "icon" | "rail" }) {
  const auth = useAuth();
  const status = useSyncStatus();
  const online = useOnline();

  const state = syncIconState({
    remoteEnabled: isRemoteEnabled(),
    authStatus: auth.status,
    phase: status.phase,
    online,
  });

  if (state === "hidden") return null;

  const Icon =
    state === "syncing"
      ? RefreshCw
      : state === "saved"
        ? CloudCheck
        : state === "error"
          ? CloudAlert
          : state === "offline"
            ? WifiOff
            : state === "signed-out"
              ? CloudOff
              : Cloud;

  const subline =
    state === "saved"
      ? (status.message ??
        (status.lastSyncedAt === null
          ? "Everything is up to date."
          : `Last synced ${relativeTime(status.lastSyncedAt)}`))
      : state === "syncing"
        ? "Pulling your latest changes."
        : state === "error"
          ? (status.message ?? "Sync failed.")
          : state === "offline"
            ? "Changes are saved locally and will sync when you're back online."
            : "Sign in to sync across devices.";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative shrink-0", variant === "rail" ? "size-9" : "size-8")}
          aria-label={TITLES[state]}
          title={TITLES[state]}
        >
          <Icon className={cn("size-4", state === "syncing" && "animate-spin")} />
          {state === "error" && (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-destructive" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="flex items-start gap-2">
          <Icon
            className={cn(
              "mt-0.5 size-4 shrink-0",
              state === "error" && "text-destructive",
              state === "saved" && "text-emerald-600 dark:text-emerald-400",
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">{TITLES[state]}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subline}</p>
          </div>
        </div>

        {auth.email !== null && (
          <p className="truncate text-xs text-muted-foreground">{auth.email}</p>
        )}

        <div className="flex gap-2">
          {state === "signed-out" ? (
            <Button size="sm" className="flex-1" asChild>
              <Link href="/auth">Sign in</Link>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={state === "syncing" || state === "offline"}
              onClick={() => void runSyncNow()}
            >
              Sync now
            </Button>
          )}
          <Button size="sm" variant="ghost" aria-label="Sync settings" asChild>
            <Link href="/settings">
              <Settings2 className="size-4" />
            </Link>
          </Button>
        </div>

        {state === "saved" && (
          <p className="text-[11px] text-muted-foreground">
            Checks for changes every {SYNC_INTERVAL_MS / 1000} seconds.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
