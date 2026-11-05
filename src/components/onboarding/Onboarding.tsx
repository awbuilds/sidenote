"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, HardDrive, Sparkles, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ThemeGallery } from "@/components/theme/ThemeGallery";
import { CompanionPet } from "@/components/companion/CompanionPet";
import { CompanionPicker } from "@/components/companion/CompanionPicker";
import { InstallButton } from "@/hooks/usePwa";
import { useInvalidateAll, useSamplePreview, useSettings } from "@/hooks/queries";
import { useUpdateSettings } from "@/hooks/mutations";
import { DEFAULT_COMPANION, companionName, requestCompanionRun } from "@/lib/companion";
import { pluralize } from "@/lib/format";
import { removeSampleData } from "@/lib/seed/seed";
import { cn } from "@/lib/utils";

const STEPS = 3;

/**
 * First-run tour.
 *
 * Only mounted while `onboardingPending` is true, which the seeder sets for a
 * fresh database. Existing installations skip it, so the destructive sample
 * choice can never be shown over someone's own notes.
 */
export function Onboarding() {
  const { data: settings } = useSettings();
  const preview = useSamplePreview();
  const update = useUpdateSettings();
  const invalidate = useInvalidateAll();

  const [step, setStep] = useState(1);
  const [choice, setChoice] = useState<"keep" | "delete">("keep");
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const companionId = settings?.companionId ?? DEFAULT_COMPANION;
  const companionEnabled = settings?.companionEnabled ?? true;
  const sampleCount = preview.data?.noteCount ?? 0;
  const replay = (settings?.onboardingCompletedAt ?? null) !== null;

  async function finish(celebrate: boolean) {
    setFinishing(true);
    try {
      await update.mutateAsync({
        onboardingPending: false,
        onboardingCompletedAt: Date.now(),
      });
      if (celebrate && companionEnabled) {
        window.setTimeout(requestCompanionRun, 700);
      }
    } finally {
      setFinishing(false);
    }
  }

  async function deleteSamples() {
    setDeleting(true);
    try {
      await removeSampleData();
      await invalidate();
      setDeleted(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <p className="text-sm font-semibold tracking-tight">Sidenote</p>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={finishing}
          onClick={() => void finish(false)}
        >
          Skip tour
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-4 sm:py-6">
        {step === 1 && (
          <section className="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Welcome
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Your notes live here.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                Sidenote keeps everything in this browser. No account, no upload,
                no waiting on a network. It works offline, and the ZIP export is
                yours whenever you want it.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <WifiOff className="mt-0.5 size-4 shrink-0 text-primary" />
                  Works offline, from the first keystroke.
                </li>
                <li className="flex items-start gap-2">
                  <HardDrive className="mt-0.5 size-4 shrink-0 text-primary" />
                  Notes are stored in this browser, not on someone&apos;s server.
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                  Optional sync when you self-host with your own Supabase.
                </li>
              </ul>
            </div>

            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-6 text-center sm:p-8">
              <div className="companion-idle">
                <CompanionPet
                  id={companionId}
                  avatarClassName="size-20 sm:size-28"
                  buttonClassName="p-2"
                />
              </div>
              <div>
                <p className="text-sm font-medium">
                  This is {companionName(companionId)}.
                </p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  A small companion that crosses the screen once in a while and presents
                  dialogs. You can turn it off, or pick another, at the end of the tour.
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Click to say hello
                </p>
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              Starter notes
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Start with a tour, or a blank page.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              A fresh notebook comes with a few example notes so the app is not
              empty. Keep them to explore, or start clean — either way, anything
              you write later is yours and is never removed by this choice.
            </p>

            {replay && (
              <p className="mt-4 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Replaying the welcome tour. Sample data can be managed in
                Settings → Sample data.
              </p>
            )}

            {deleted || sampleCount === 0 ? (
              <div className="mt-8 rounded-xl border border-dashed p-6">
                <p className="text-sm font-medium">The workspace is empty.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can restore the sample notes any time from Settings →
                  Sample data.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {(preview.data?.notes ?? []).map((note) => (
                    <article key={note.id} className="rounded-xl border bg-card p-4">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {note.notebook}
                      </p>
                      <h2 className="mt-1 line-clamp-2 text-sm font-medium">{note.title}</h2>
                      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {note.excerpt}
                      </p>
                    </article>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {pluralize(sampleCount, "note")} ·{" "}
                  {pluralize(preview.data?.notebookCount ?? 0, "notebook")} ·{" "}
                  {pluralize(preview.data?.tagCount ?? 0, "tag")}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {!replay && (
                    <>
                  <button
                    type="button"
                    aria-pressed={choice === "keep"}
                    onClick={() => setChoice("keep")}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      choice === "keep"
                        ? "border-primary bg-accent/40 ring-1 ring-primary"
                        : "hover:bg-accent/30",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {choice === "keep" && <Check className="size-4 text-primary" />}
                      Keep the sample notes
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Explore the editor, links, tags and backup with content
                      already in place.
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={choice === "delete"}
                    onClick={() => setChoice("delete")}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      choice === "delete"
                        ? "border-destructive bg-destructive/5 ring-1 ring-destructive"
                        : "hover:bg-accent/30",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Trash2 className="size-4" />
                      Start with a blank workspace
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Delete the {pluralize(sampleCount, "sample note")}. You can
                      restore them later in Settings.
                    </span>
                  </button>
                    </>
                  )}
                </div>

                {!replay && choice === "delete" && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                    <p className="mr-auto text-xs text-muted-foreground">
                      This removes the sample notebooks, notes, tags and images.
                      Notes you create are never touched.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setChoice("keep")}>
                      Keep them
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleting}
                      onClick={() => void deleteSamples()}
                    >
                      {deleting ? "Removing…" : "Delete samples"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {step === 3 && (
          <section>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              Make it yours
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Pick a look, and a companion.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Every theme changes the whole app, not just the accent colour. You
              can change any of this later in Settings.
            </p>

            <div className="mt-6 rounded-xl border p-4">
              <ThemeGallery compact />
            </div>

            <div className="mt-4 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">Companion</h2>
                  <p className="text-xs text-muted-foreground">
                    Let {companionName(companionId)} cross the screen and present
                    dialogs.
                  </p>
                </div>
                <Switch
                  checked={companionEnabled}
                  onCheckedChange={(checked) =>
                    update.mutate({ companionEnabled: checked })
                  }
                  aria-label="Enable companion"
                />
              </div>
              <CompanionPicker
                className="mt-3"
                value={companionId}
                onChange={(id) => update.mutate({ companionId: id })}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <InstallButton />
              <p className="text-xs text-muted-foreground">
                You can export a ZIP backup any time from Settings.
              </p>
            </div>
          </section>
        )}
      </main>

      <footer className="sticky bottom-0 z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-4 border-t bg-background/95 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-1.5" aria-label={`Step ${step} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, index) => (
            <span
              key={index}
              aria-current={step === index + 1 ? "step" : undefined}
              className={cn(
                "h-1.5 rounded-full transition-all",
                step === index + 1 ? "w-6 bg-primary" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setStep((value) => value - 1)}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
          )}
          {step < STEPS ? (
            <Button size="sm" onClick={() => setStep((value) => value + 1)}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button size="sm" disabled={finishing} onClick={() => void finish(true)}>
              {finishing ? "Opening…" : "Start writing"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
