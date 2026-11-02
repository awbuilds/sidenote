"use client";

import { useQuery } from "@tanstack/react-query";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, relativeTime } from "@/lib/format";
import { listVersions } from "@/lib/db/repositories/notes";
import { useRestoreVersion } from "@/hooks/mutations";
import { QUERY_KEYS } from "@/hooks/query-keys";
import type { NoteId } from "@/lib/db/types";

/**
 * Version history.
 *
 * Each entry is the state *before* a save, so the newest entry is the state
 * you had before your most recent edit. Restoring is itself a save, so nothing
 * in the list is destroyed by restoring.
 */
export function VersionHistory({
  noteId,
  currentVersion,
  onRestored,
}: {
  noteId: NoteId;
  currentVersion: number;
  onRestored: () => void;
}) {
  const { data, isPending } = useQuery({
    queryKey: QUERY_KEYS.versions(noteId),
    queryFn: () => listVersions(noteId),
  });
  const restore = useRestoreVersion();

  if (isPending) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const versions = data ?? [];

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <History className="size-5 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          No earlier versions yet. A snapshot is taken each time you edit.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      <p className="px-2 py-1 text-xs text-muted-foreground">
        {versions.length} snapshot{versions.length === 1 ? "" : "s"} · currently
        v{currentVersion}
      </p>
      {versions.map((version) => (
        <div
          key={version.id}
          className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              v{version.version} · {version.title.trim() || "Untitled note"}
            </p>
            <p className="text-xs text-muted-foreground" title={formatDateTime(version.createdAt)}>
              {relativeTime(version.createdAt)} ago
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs"
            disabled={restore.isPending}
            onClick={() => restore.mutate({ noteId, version: version.version }, { onSuccess: onRestored })}
          >
            <RotateCcw className="size-3.5" />
            Restore
          </Button>
        </div>
      ))}
    </div>
  );
}
