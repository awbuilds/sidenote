"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

      <AlertDialog open={confirmWipe} onOpenChange={setConfirmWipe}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all data?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. If you have not downloaded a backup, the
              notes will be gone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => wipe.mutate()}
            >
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
