"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, HardDrive, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { backupReminder, toCopyAccountState } from "@/lib/copy";
import { formatBytes, getStorageUsage, requestPersistence, type StorageUsage } from "@/lib/storage/quota";
import { cn } from "@/lib/utils";

/**
 * Storage health.
 *
 * Browser storage is evictable, and eviction is silent. This component exists
 * so the risk is visible before it matters rather than after a note is gone.
 *
 * `full` (settings) explains everything: quota bar, the persist request, and
 * the ZIP reminder. `compact` (sidebar) is one line that links here — the
 * sidebar footer had become a wall of calls-to-action.
 */
export function StorageStatus({
  className,
  variant = "full",
}: {
  className?: string;
  variant?: "full" | "compact";
}) {
  const auth = useAuth();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [requesting, setRequesting] = useState(false);

  const refresh = () => {
    void getStorageUsage().then(setUsage);
  };

  useEffect(refresh, []);

  if (usage === null) return null;

  if (variant === "compact") {
    return (
      <Link
        href="/settings"
        title={usage.persisted ? "Storage protected" : "Storage can be cleared by the system"}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent/50",
          className,
        )}
      >
        {usage.persisted ? (
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <ShieldQuestion className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">
          {formatBytes(usage.usage)} of {formatBytes(usage.quota)}
        </span>
      </Link>
    );
  }

  const percent = usage.ratio === null ? null : Math.min(100, Math.round(usage.ratio * 100));

  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {usage.persisted ? (
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <ShieldQuestion className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        )}
        <span className="truncate">
          {usage.persisted
            ? "Storage protected from automatic cleanup"
            : "Storage can be cleared by the system"}
        </span>
      </div>

      {usage.quota > 0 && (
        <div className="mt-2 space-y-1">
          <Progress value={percent ?? 0} className="h-1.5" />
          <p className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <HardDrive className="size-3" />
              {formatBytes(usage.usage)} used
            </span>
            <span>{formatBytes(usage.quota)} available</span>
          </p>
          {usage.ratio !== null && usage.ratio >= 0.9 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Storage is nearly full. Export a backup, then remove large attachments.
            </p>
          )}
        </div>
      )}

      {!usage.persisted && (
        <div className="mt-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs"
            disabled={requesting}
            onClick={async () => {
              setRequesting(true);
              await requestPersistence();
              refresh();
              setRequesting(false);
            }}
          >
            {requesting ? "Requesting…" : "Protect this data"}
          </Button>
        </div>
      )}

      {usage.persisted && (
        <p className="mt-2 flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-px size-3 shrink-0" />
          <span>{backupReminder(toCopyAccountState(auth.status))}</span>
        </p>
      )}
    </div>
  );
}
