"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useInstallPrompt } from "@/hooks/usePwa";
import { useSettings } from "@/hooks/queries";
import { useUpdateSettings } from "@/hooks/mutations";
import { isRemoteEnabled } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** `display-mode: standalone` capture also needs to work on iOS Safari. */
function readStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const ios =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return media || ios;
}

const subscribeNoop = () => () => {};

/**
 * First-run checklist: install, (optional) sign in, back up. It disappears
 * when every step is done or the user dismisses it for good, and it lives in
 * the sidebar so onboarding is not a modal people bounce off.
 */
export function GettingStartedCard() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const auth = useAuth();
  const { canInstall, install } = useInstallPrompt();
  const standalone = useSyncExternalStore(subscribeNoop, readStandalone, () => false);

  if (settings === undefined || settings.onboardingDismissed) return null;

  const remote = isRemoteEnabled();
  const signedIn = auth.status === "signed-in";
  const backedUp = settings.lastBackupAt !== null;

  const steps: {
    key: string;
    label: string;
    done: boolean;
    action?: React.ReactNode;
  }[] = [
    {
      key: "install",
      label: standalone
        ? "Installed as an app"
        : canInstall
          ? "Install as an app"
          : "Add this app to your home screen",
      done: standalone,
      action: canInstall ? (
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={install}>
          Install
        </Button>
      ) : undefined,
    },
  ];

  if (remote) {
    steps.push({
      key: "sync",
      label: signedIn ? "Signed in for sync" : "Sign in to sync devices (optional)",
      done: signedIn,
      action: signedIn ? undefined : (
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" asChild>
          <Link href="/auth">Sign in</Link>
        </Button>
      ),
    });
  }

  steps.push({
    key: "backup",
    label: backedUp ? "Backup exported" : "Export your first backup",
    done: backedUp,
    action: backedUp ? undefined : (
      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" asChild>
        <Link href="/settings">Back up</Link>
      </Button>
    ),
  });

  if (steps.every((step) => step.done)) return null;

  return (
    <div className="mx-2 mt-2 rounded-lg border border-dashed p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium">Get set up</p>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-1 -mt-1 size-6"
          aria-label="Dismiss setup checklist"
          onClick={() => updateSettings.mutate({ onboardingDismissed: true })}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <ul className="mt-2 space-y-1.5">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-2 text-xs">
            {step.done ? (
              <Check className="size-3.5 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="size-3.5 shrink-0 text-muted-foreground/50" />
            )}
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                step.done && "text-muted-foreground line-through",
              )}
            >
              {step.label}
            </span>
            {!step.done && step.action}
          </li>
        ))}
      </ul>
    </div>
  );
}
