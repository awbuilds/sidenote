"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Providers } from "@/components/providers";
import { StorageStatus } from "@/components/layout/StorageStatus";
import { ThemeGallery } from "@/components/theme/ThemeGallery";
import { BackupSection } from "@/components/settings/BackupSection";
import { AccountSection } from "@/components/settings/AccountSection";
import { SampleDataSection } from "@/components/settings/SampleDataSection";
import { DeleteSection } from "@/components/settings/DeleteSection";
import { SharesSection } from "@/components/settings/SharesSection";
import { CompanionSection } from "@/components/companion/CompanionSection";
import { Brand } from "@/components/Brand";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/queries";
import { useUpdateSettings } from "@/hooks/mutations";
import { settingsSubtitle, toCopyAccountState } from "@/lib/copy";
import {
  EDITOR_FONT_LABELS,
  EDITOR_LINE_HEIGHT_LABELS,
  EDITOR_WIDTH_LABELS,
  type EditorFont,
  type EditorLineHeight,
  type EditorWidth,
} from "@/lib/typography";

/**
 * Section order is deliberate:
 *   account (what syncs) → storage → backup/restore/profile → samples → danger.
 *
 * The subtitle reflects the real account state. It used to say "nothing is
 * uploaded anywhere", which stopped being true the day sync shipped.
 */
function SettingsView() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const auth = useAuth();
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <Button variant="ghost" size="sm" className="mb-6 -ml-2 gap-2" asChild>
        <Link href="/notes">
          <ArrowLeft className="size-4" />
          Back to notes
        </Link>
      </Button>

      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {settingsSubtitle(toCopyAccountState(auth.status))}
      </p>

      <section className="mt-6 space-y-2 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Appearance</h2>
        <ThemeGallery />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div>
            <p className="text-sm">Welcome tour</p>
            <p className="text-xs text-muted-foreground">
              Replay the three-page introduction. Sample deletion stays in Settings.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await updateSettings.mutateAsync({ onboardingPending: true });
              router.push("/notes");
            }}
          >
            Show again
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="editor-font">Editor font</Label>
            <Select
              value={settings?.editorFont ?? "sans"}
              onValueChange={(value) => updateSettings.mutate({ editorFont: value as EditorFont })}
            >
              <SelectTrigger id="editor-font">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EDITOR_FONT_LABELS) as EditorFont[]).map((font) => (
                  <SelectItem key={font} value={font}>
                    {EDITOR_FONT_LABELS[font]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editor-width">Reading width</Label>
            <Select
              value={settings?.editorWidth ?? "medium"}
              onValueChange={(value) => updateSettings.mutate({ editorWidth: value as EditorWidth })}
            >
              <SelectTrigger id="editor-width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EDITOR_WIDTH_LABELS) as EditorWidth[]).map((width) => (
                  <SelectItem key={width} value={width}>
                    {EDITOR_WIDTH_LABELS[width]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editor-line-height">Line height</Label>
            <Select
              value={settings?.editorLineHeight ?? "normal"}
              onValueChange={(value) =>
                updateSettings.mutate({ editorLineHeight: value as EditorLineHeight })
              }
            >
              <SelectTrigger id="editor-line-height">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EDITOR_LINE_HEIGHT_LABELS) as EditorLineHeight[]).map((height) => (
                  <SelectItem key={height} value={height}>
                    {EDITOR_LINE_HEIGHT_LABELS[height]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <CompanionSection />

      <AccountSection />

      <SharesSection />

      <section className="mt-4 space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Storage</h2>
        <StorageStatus />
        <p className="text-xs text-muted-foreground">
          Version history keeps the last {settings?.versionLimit ?? 30} snapshots
          per note, and drops anything older than {settings?.versionMaxAgeDays ?? 90}{" "}
          days.
        </p>
      </section>

      <div className="mt-4">
        <BackupSection />
      </div>

      <SampleDataSection />

      <DeleteSection />

      <section className="mt-4 space-y-2 rounded-lg border p-4">
        <h2 className="text-sm font-medium">About</h2>
        <p className="text-sm text-muted-foreground">
          Sidenote is free and open source under the GNU AGPL-3.0. The source is
          the same code running here.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://github.com/awbuilds/sidenote"
              target="_blank"
              rel="noreferrer"
            >
              Source code
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a
              href="https://github.com/awbuilds/sidenote/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
            >
              Licence
            </a>
          </Button>
        </div>
      </section>

      <Brand className="mt-8 text-center" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Providers>
      <main className="min-h-dvh">
        <SettingsView />
      </main>
    </Providers>
  );
}
