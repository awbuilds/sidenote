"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, relativeTime } from "@/lib/format";
import { listVersions } from "@/lib/db/repositories/notes";
import { useCreateVersion, useRestoreVersion } from "@/hooks/mutations";
import { QUERY_KEYS } from "@/hooks/query-keys";
import type { NoteId } from "@/lib/db/types";

/**
 * Version history.
 *
 * Each automatic entry is the state *before* a save. Snapshots are taken on
 * the first edit, on a rename, and at most every five minutes — not on every
 * autosave, which used to fill the list with the last few minutes of typing.
 * A named version is kept regardless of age.
 *
 * Restoring is itself a save, so nothing in the list is destroyed by
 * restoring.
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
  const create = useCreateVersion();
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState("");

  const saveVersion = () => {
    create.mutate(
      { noteId, label },
      {
        onSuccess: () => {
          setNaming(false);
          setLabel("");
        },
      },
    );
  };

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

  return (
    <div className="space-y-1 p-2">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <p className="text-xs text-muted-foreground">
          {versions.length} snapshot{versions.length === 1 ? "" : "s"} · currently
          v{currentVersion}
        </p>
        {!naming && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setNaming(true)}
          >
            Save a version
          </Button>
        )}
      </div>

      {naming && (
        <form
          className="flex items-center gap-1.5 px-2 pb-1"
          onSubmit={(event) => {
            event.preventDefault();
            saveVersion();
          }}
        >
          <Input
            autoFocus
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Name this version (optional)"
            aria-label="Version name"
            className="h-7 text-xs"
            onKeyDown={(event) => {
              if (event.key === "Escape") setNaming(false);
            }}
          />
          <Button type="submit" size="sm" className="h-7 text-xs" disabled={create.isPending}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setNaming(false);
              setLabel("");
            }}
          >
            Cancel
          </Button>
        </form>
      )}

      {versions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <History className="size-5 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No earlier versions yet. Snapshots are taken on the first edit, on a
            rename, and at most every five minutes. You can also save a named
            version at any time.
          </p>
        </div>
      ) : (
        versions.map((version) => (
          <div
            key={version.id}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {version.label ?? (version.title.trim() || "Untitled note")}
              </p>
              <p
                className="text-xs text-muted-foreground"
                title={formatDateTime(version.createdAt)}
              >
                v{version.version} · {relativeTime(version.createdAt)} ago
                {version.kind === "manual" ? " · named" : ""}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1.5 text-xs"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate({ noteId, version: version.version }, { onSuccess: onRestored })
              }
            >
              <RotateCcw className="size-3.5" />
              Restore
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
