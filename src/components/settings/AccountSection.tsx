"use client";

import Link from "next/link";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { useRemoteAttachmentUsage } from "@/hooks/usage";
import { relativeTime } from "@/lib/format";
import { FREE_ATTACHMENT_BYTES } from "@/lib/attachments/path";
import { formatBytes } from "@/lib/storage/quota";
import { signOutRemote } from "@/lib/supabase/actions";
import { runSyncNow } from "@/lib/sync/trigger";
import type { AuthSnapshot } from "@/lib/supabase/auth-store";
import type { SyncStatus } from "@/lib/sync/status";

function statusLine(auth: AuthSnapshot, status: SyncStatus): string {
  if (status.phase === "syncing") return "Syncing…";
  if (status.phase === "error") return status.message ?? "Sync failed";
  if (status.lastSyncedAt !== null) {
    return `Last synced ${relativeTime(status.lastSyncedAt)}`;
  }
  if (auth.status === "signed-in") return "Not synced yet";
  return "";
}

export function AccountSection() {
  const auth = useAuth();
  const status = useSyncStatus();
  const usage = useRemoteAttachmentUsage();

  if (auth.status === "disabled") {
    return (
      <section className="mt-4 space-y-2 rounded-lg border p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <CloudOff className="size-4" />
          Sync
        </h2>
        <p className="text-sm text-muted-foreground">
          This build has no remote configured, so everything stays in this browser.
        </p>
      </section>
    );
  }

  if (auth.status === "signed-out" || auth.status === "loading") {
    return (
      <section className="mt-4 space-y-2 rounded-lg border p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <CloudOff className="size-4" />
          Sync across devices
        </h2>
        <p className="text-sm text-muted-foreground">
          Your notes live in this browser. Sign in to back them up and sync them to
          your other devices — offline editing keeps working either way.
        </p>
        <Button variant="outline" size="sm" className="mt-1" asChild>
          <Link href="/auth">Sign in or create an account</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="mt-4 space-y-3 rounded-lg border p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <Cloud className="size-4" />
        Sync
      </h2>
      <p className="text-sm">
        Signed in as <span className="font-medium">{auth.email}</span>
      </p>
      <p className="text-xs text-muted-foreground">{statusLine(auth, status)}</p>

      {usage.data !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Synced attachments</span>
            <span className="tabular-nums">
              {formatBytes(usage.data)} of {formatBytes(FREE_ATTACHMENT_BYTES)}
            </span>
          </div>
          <Progress
            value={Math.min(100, (usage.data / FREE_ATTACHMENT_BYTES) * 100)}
            className="h-1.5"
          />
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={status.phase === "syncing"}
          onClick={() => void runSyncNow()}
        >
          <RefreshCw className={status.phase === "syncing" ? "size-4 animate-spin" : "size-4"} />
          Sync now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await signOutRemote();
            toast.success("Signed out", {
              description: "Your notes stay on this device.",
            });
          }}
        >
          Sign out
        </Button>
      </div>
    </section>
  );
}
