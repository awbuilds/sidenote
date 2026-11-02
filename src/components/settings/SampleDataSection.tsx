"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Trash2 } from "lucide-react";
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
import { useInvalidateAll } from "@/hooks/queries";
import { pluralize } from "@/lib/format";
import { sampleDataWarning } from "@/lib/copy";
import { removeSampleData, restoreSampleData } from "@/lib/seed/seed";

/**
 * Sample-data controls, moved out of the sidebar: restoring is destructive
 * (it wipes what is there), so it belongs with the other data controls, behind
 * a confirmation.
 */
export function SampleDataSection() {
  const invalidate = useInvalidateAll();
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    setBusy(true);
    try {
      const result = await restoreSampleData();
      await invalidate();
      toast.success("Sample data restored", {
        description: `${pluralize(result.notes, "note")} and ${pluralize(result.notebooks, "notebook")}. Anything you had written is gone.`,
      });
    } catch {
      toast.error("Could not restore the sample data");
    } finally {
      setBusy(false);
      setConfirmRestore(false);
    }
  };

  return (
    <>
      <section className="mt-4 space-y-2 rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-medium">Sample data</h2>
        <p className="text-sm text-muted-foreground">
          The app ships with example notebooks and notes so there is something
          to look at. Removing them is permanent; restoring them replaces
          whatever is currently in this browser.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" className="gap-2" disabled={busy} onClick={() => setConfirmRestore(true)}>
            <RotateCcw className="size-3.5" />
            Restore sample data
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={busy}
            onClick={async () => {
              await removeSampleData();
              window.location.reload();
            }}
          >
            <Trash2 className="size-3.5" />
            Remove sample data
          </Button>
        </div>
      </section>

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore sample data?</AlertDialogTitle>
            <AlertDialogDescription>{sampleDataWarning()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restore()}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
