/**
 * The companion pets.
 *
 * Original artwork lives in `components/companion/CompanionAvatar.tsx`; this
 * module only names them so settings and onboarding can share one list without
 * importing React.
 */

export type CompanionId = "fox" | "cat" | "owl" | "moss";

export interface CompanionOption {
  id: CompanionId;
  name: string;
  blurb: string;
}

export const COMPANIONS: CompanionOption[] = [
  { id: "fox", name: "Pip", blurb: "A paper fox with somewhere to be." },
  { id: "cat", name: "Miso", blurb: "Sleeps on warm notebooks." },
  { id: "owl", name: "Olive", blurb: "Reads over your shoulder." },
  { id: "moss", name: "Moss", blurb: "A very small, very calm blob." },
];

export const DEFAULT_COMPANION: CompanionId = "fox";

export function isCompanionId(value: unknown): value is CompanionId {
  return COMPANIONS.some((companion) => companion.id === value);
}

export function companionName(id: CompanionId): string {
  return COMPANIONS.find((companion) => companion.id === id)?.name ?? "Companion";
}

/** Fired when the companion should make a run across the screen. */
export const COMPANION_RUN_EVENT = "sidenote:companion-run";

export function requestCompanionRun(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COMPANION_RUN_EVENT));
}
