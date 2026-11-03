import type { AppSettings } from "@/lib/db/types";

type OnboardingSettings = Pick<AppSettings, "onboardingPending">;

/**
 * The tour is for a fresh database and for an explicit replay.
 *
 * `onboardingPending` is written by the seeder and by the "Show again" action;
 * finishing or skipping clears it. `onboardingCompletedAt` is only used to tell
 * a replay from a first run, so replaying never has to erase history.
 */
export function shouldShowOnboarding(settings: OnboardingSettings): boolean {
  return settings.onboardingPending;
}
