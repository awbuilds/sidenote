"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

import { downloadBlob } from "@/lib/transfer/export-note";
import {
  defaultArchiveName,
  exportAll,
  parseExportedManifest,
} from "@/lib/transfer/zip-export";
import { importFromArchive, type ImportResult } from "@/lib/transfer/zip-import";
import { importEnex, readImportFile } from "@/lib/transfer/import-actions";
import { useUpdateSettings } from "@/hooks/mutations";
import { useSettings } from "@/hooks/queries";
import { pluralize, relativeTime } from "@/lib/format";
import { backupHealth } from "@/lib/backup";

/**
 * Backup and restore controls.
 *
 * The ZIP is the copy the user holds themselves, so the wording is blunt about
 * what an import will overwrite. The danger zone lives in `DeleteSection`.
 */
export function BackupSection() {
  const client = useQueryClient();
  const updateSettings = useUpdateSettings();
  const { data: settings } = useSettings();
  const health = settings === undefined ? null : backupHealth(settings);

  const zipInput = useRef<HTMLInputElement>(null);
  const enexInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<null | "export" | "zip-import" | "enex-import">(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);

  const runExport = async () => {
    setBusy("export");
    try {
      const { blob, manifest } = await exportAll();
      downloadBlob(blob, defaultArchiveName());
      updateSettings.mutate({
        lastBackupAt: Date.now(),
        lastBackupDataVersion: settings?.dataVersion ?? 0,
      });
      toast.success("Backup downloaded", {
        description: `${pluralize(manifest.counts.notes, "note")}, ${manifest.counts.attachments} attachment(s), ${manifest.counts.notebooks} notebook(s).`,
      });
    } catch (error) {
      toast.error("Export failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const describe = async (file: File) => {
    const manifest = await parseExportedManifest(file);
    if (manifest === null) return null;
    return `${pluralize(manifest.counts.notes, "note")} and ${manifest.counts.attachments} attachment(s), written ${new Date(manifest.exportedAt).toLocaleString()}`;
  };

  const doImport = async (file: File, kind: "zip" | "enex") => {
    setBusy(kind === "zip" ? "zip-import" : "enex-import");
    try {
      if (kind === "enex") {
        await importEnex(await readImportFile(file));
      } else {
        const result: ImportResult = await importFromArchive(await readImportFile(file));
        toast.success(
          `Restored ${pluralize(result.notes, "note")} and ${pluralize(result.notebooks, "notebook", "notebooks")}`,
          { description: result.warnings.length > 0 ? result.warnings.join(" ") : undefined },
        );
      }
      await client.invalidateQueries();
    } catch (error) {
      toast.error("Import failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
      setPendingImport(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Backup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Downloads a ZIP containing readable Markdown, a lossless copy of
          everything, and all attachment files.
        </p>
        <Button
          className="mt-3 gap-2"
          onClick={() => void runExport()}
          disabled={busy !== null}
        >
          <Download className="size-4" />
          {busy === "export" ? "Preparing…" : "Download backup"}
        </Button>

        {health !== null && (
          <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
            {health.state === "none"
              ? "No backup yet — a cleared browser cannot be recovered without one."
              : health.state === "fresh"
                ? `Last backup ${relativeTime(settings!.lastBackupAt!)} ago.`
                : `Last backup ${relativeTime(settings!.lastBackupAt!)} ago${
                    health.changesSince === null
                      ? ""
                      : ` · ${health.changesSince} change${health.changesSince === 1 ? "" : "s"} since`
                  }. Export a fresh one.`}
          </p>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Restore</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Importing <strong>merges</strong> by id — existing notes with the same
          id are overwritten, everything else is left alone. It does not erase
          what is already here.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            ref={zipInput}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file === undefined) return;
              const summary = await describe(file);
              if (summary === null) {
                toast.error("No manifest in that archive", {
                  description: "It may not be a backup from this app.",
                });
                return;
              }
              setPendingImport(file);
            }}
          />
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => zipInput.current?.click()}
            disabled={busy !== null}
          >
            <Upload className="size-4" />
            {busy === "zip-import" ? "Restoring…" : "Restore from ZIP"}
          </Button>

          <input
            ref={enexInput}
            type="file"
            accept=".enex,application/xml,text/xml"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) await doImport(file, "enex");
            }}
          />
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => enexInput.current?.click()}
            disabled={busy !== null}
          >
            <Upload className="size-4" />
            {busy === "enex-import" ? "Importing…" : "Import Evernote .enex"}
          </Button>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            Evernote import is a one-way migration. Formatting is approximated
            from ENEX HTML — check the result rather than trusting it.
          </span>
        </p>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Profile</h2>
        <div className="mt-3 space-y-2">
          <Label htmlFor="profile-name">Display name</Label>
          <input
            id="profile-name"
            defaultValue={settings?.profileName ?? ""}
            onBlur={(event) => updateSettings.mutate({ profileName: event.target.value })}
            placeholder="Shown in the sidebar"
            className="h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </section>

      <AlertDialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Notes in the backup overwrite anything with the same id. Nothing
              is deleted that is not in the backup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingImport !== null) void doImport(pendingImport, "zip");
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
