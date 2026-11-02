"use client";

import Link from "next/link";
import { Cloud, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { cn } from "@/lib/utils";

/**
 * The always-visible sign-in / sync affordance.
 *
 * Sync is optional, so it is never a gate — but it must be *discoverable*,
 * which a settings-only panel is not. Signed out it advertises sign-in;
 * signed in it reports state and links to settings. Hidden only when the
 * build has no remote configured at all.
 */
export function AccountButton({ variant }: { variant: "sidebar" | "rail" }) {
  const auth = useAuth();
  const status = useSyncStatus();

  if (auth.status === "disabled" || auth.status === "loading") return null;

  const signedIn = auth.status === "signed-in";
  const label = signedIn
    ? status.phase === "error"
      ? "Sync problem — open settings"
      : `Signed in as ${auth.email ?? "your account"}`
    : "Sign in to sync across devices";
  const href = signedIn ? "/settings" : "/auth";
  const Icon = signedIn ? Cloud : CloudOff;
  const dot =
    signedIn && status.phase === "syncing"
      ? "bg-amber-500"
      : signedIn && status.phase === "error"
        ? "bg-destructive"
        : null;

  if (variant === "rail") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="relative size-9" aria-label={label} asChild>
            <Link href={href}>
              <Icon className="size-4" />
              {dot !== null && (
                <span
                  className={cn(
                    "absolute right-1 top-1 size-1.5 rounded-full",
                    dot,
                    status.phase === "syncing" && "animate-pulse",
                  )}
                />
              )}
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-8 w-full justify-start gap-2",
        !signedIn && "text-primary hover:text-primary",
      )}
      asChild
    >
      <Link href={href}>
        <Icon className="size-4 opacity-80" />
        <span className="min-w-0 flex-1 truncate text-left">
          {signedIn ? "Sync" : "Sign in to sync"}
        </span>
        {dot !== null && (
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              dot,
              status.phase === "syncing" && "animate-pulse",
            )}
          />
        )}
      </Link>
    </Button>
  );
}
