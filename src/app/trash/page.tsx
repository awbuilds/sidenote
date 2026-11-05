"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PetAlertDialog } from "@/components/companion/PetAlertDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Providers } from "@/components/providers";
import { StorageStatus } from "@/components/layout/StorageStatus";
import { useTrashedNotes } from "@/hooks/queries";
import { useAuth } from "@/hooks/use-auth";
import { useEmptyTrash, usePurgeNotes, useRestoreNotes } from "@/hooks/mutations";
import { formatDateTime, pluralize, relativeTime } from "@/lib/format";
import { toCopyAccountState, trashWarning } from "@/lib/copy";
import type { NoteId } from "@/lib/db/types";

function TrashView() {
  const { data, isPending } = useTrashedNotes();
  const auth = useAuth();
  const restore = useRestoreNotes();
  const purge = usePurgeNotes();
  const empty = useEmptyTrash();

  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<NoteId[] | null>(null);

  const notes = data ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <Button variant="ghost" size="sm" className="mb-6 -ml-2 gap-2" asChild>
        <Link href="/notes">
          <ArrowLeft className="size-4" />
          Back to notes
        </Link>
      </Button>

      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Trash2 className="size-5" />
          Trash
        </h1>
        {notes.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmEmpty(true)}
          >
            Empty trash
          </Button>
        )}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        {isPending
          ? "Loading…"
          : notes.length === 0
            ? "Trash is empty."
            : `${pluralize(notes.length, "note")} waiting to be cleared.`}
      </p>

      {isPending ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Notes you trash land here and can be restored until you empty it.
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y rounded-lg border">
          {notes.map((note) => (
            <li key={note.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {note.title.trim() || "Untitled note"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Trashed {relativeTime(note.trashedAt ?? note.updatedAt)} ago ·{" "}
                  {formatDateTime(note.trashedAt ?? note.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => restore.mutate([note.id])}
                >
                  <RotateCcw className="size-3.5" />
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  aria-label={`Delete ${note.title || "note"} permanently`}
                  onClick={() => setPurgeTarget([note.id])}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8 rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-medium">Before you clear anything</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {trashWarning(toCopyAccountState(auth.status))}
        </p>
        <div className="mt-3">
          <StorageStatus />
        </div>
      </section>

      <PetAlertDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title="Empty the trash?"
        description={
          <>
            {pluralize(notes.length, "note")} will be deleted permanently,
            including their attachments and version history. This cannot be
            undone.
          </>
        }
        confirmLabel="Delete permanently"
        confirmVariant="destructive"
        tone="danger"
        onConfirm={() => empty.mutate()}
      />

      <PetAlertDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => !open && setPurgeTarget(null)}
        title="Delete permanently?"
        description={
          <>
            {purgeTarget === null ? "" : pluralize(purgeTarget.length, "note")}{" "}
            will be deleted along with their attachments and history. This
            cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        confirmVariant="destructive"
        tone="danger"
        onConfirm={() => {
          if (purgeTarget) purge.mutate(purgeTarget);
        }}
      />
    </div>
  );
}

export default function TrashPage() {
  return (
    <Providers>
      <main className="min-h-dvh">
        <TrashView />
      </main>
    </Providers>
  );
}
