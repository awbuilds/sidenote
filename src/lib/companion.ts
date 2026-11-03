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

/** Things the companion says when petted, rotated in order. */
export const COMPANION_LINES: Record<CompanionId, string[]> = {
  fox: [
    "Pip wags a paper tail.",
    "Pip found a warm paragraph.",
    "Pip is guarding this note.",
    "Pip did a tiny loop.",
    "Pip says: back it up.",
  ],
  cat: [
    "Miso purrs on the keyboard.",
    "Miso claims this notebook.",
    "Miso blinks slowly.",
    "Miso knocked a tag off the desk.",
    "Miso says: five more minutes.",
  ],
  owl: [
    "Olive read that paragraph too.",
    "Olive approves the heading.",
    "Olive hoots once, softly.",
    "Olive is checking your links.",
    "Olive says: cite your sources.",
  ],
  moss: [
    "Moss is very calm.",
    "Moss grew a little.",
    "Moss likes this page.",
    "Moss says nothing. It is enough.",
    "Moss is photosynthesising.",
  ],
};

/** Fired when the companion should make a run across the screen. */
export const COMPANION_RUN_EVENT = "sidenote:companion-run";

export function requestCompanionRun(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COMPANION_RUN_EVENT));
}
