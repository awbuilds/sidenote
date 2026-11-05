"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PetAlertDialog } from "@/components/companion/PetAlertDialog";
import { useAuth } from "@/hooks/use-auth";
import { useWipeAllData } from "@/hooks/mutations";
import { deleteWarning, toCopyAccountState } from "@/lib/copy";

/**
 * The danger zone, kept last on the settings page and separate from backup so
 * ordering reads as "your data, then the thing that deletes it".
 */
export function DeleteSection() {
  const auth = useAuth();
  const wipe = useWipeAllData();
  const [confirmWipe, setConfirmWipe] = useState(false);

  return (
    <>
      <section className="mt-4 rounded-lg border border-destructive/40 p-4">
        <h2 className="text-sm font-medium text-destructive">Delete everything</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {deleteWarning(toCopyAccountState(auth.status))}
        </p>
        <Button
          variant="destructive"
          className="mt-3"
          onClick={() => setConfirmWipe(true)}
          disabled={wipe.isPending}
        >
          Delete all data
        </Button>
      </section>

      <PetAlertDialog
        open={confirmWipe}
        onOpenChange={setConfirmWipe}
        title="Delete all data?"
        description="This cannot be undone. If you have not downloaded a backup, the notes will be gone."
        confirmLabel="Delete everything"
        confirmVariant="destructive"
        tone="danger"
        onConfirm={() => wipe.mutate()}
      />
    </>
  );
}
