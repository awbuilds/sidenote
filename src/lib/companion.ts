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

/** The mood of a confirmation or utility dialog. */
export type CompanionDialogTone = "danger" | "warning" | "restore";

/** Every dialog the companion can present. */
export type CompanionDialogMode =
  | CompanionDialogTone
  | "share"
  | "link"
  | "pick"
  | "tags"
  | "command";

/**
 * What the companion says while presenting a dialog.
 *
 * These are decorative: the dialog's own title and description carry the
 * warning. Keep them in character and, for `danger`, serious — the pet must
 * never make data loss sound safe.
 */
export const COMPANION_DIALOG_LINES: Record<
  CompanionId,
  Record<CompanionDialogMode, string[]>
> = {
  fox: {
    danger: ["I checked twice. This one is forever.", "I'll stand guard while you decide."],
    warning: ["I can carry it to the trash.", "It can come back. I'll watch it."],
    restore: ["I read the manifest twice.", "This replaces the shelf, not the room."],
    share: ["A link is a door. I'll hold it open.", "Anyone with the key can come in."],
    link: ["Which note should I connect?", "I'll tie the knot."],
    pick: ["Where should it go?", "I know a good shelf."],
    tags: ["Let's tidy the labels.", "I sorted these by smell."],
    command: ["What are we looking for?", "Say the word. I'll fetch it."],
  },
  cat: {
    danger: ["I'm sitting on the undo button.", "I would not nap through this one."],
    warning: ["It can come back. I'll keep the box.", "The trash can is reversible."],
    restore: ["This one overwrites my nap spot.", "I checked the backup. Mostly."],
    share: ["A public link. How brave.", "I'll guard the door. Probably."],
    link: ["Pick a note. I'll pretend not to care.", "Another link? Fine."],
    pick: ["Choose a shelf. I'll approve it.", "Anywhere but my nap spot."],
    tags: ["Labels. I knocked some off.", "Let's put these back."],
    command: ["What are we looking for?", "I was already awake."],
  },
  owl: {
    danger: ["I read the warning twice.", "This one has no second draft."],
    warning: ["The trash can is reversible.", "I'll note the page number."],
    restore: ["I checked the manifest.", "The old copy is in the margin."],
    share: ["A link leaves the nest.", "I'll keep the receipt."],
    link: ["Which note cites this one?", "I'll draw the line."],
    pick: ["Choose the right shelf.", "I know where it belongs."],
    tags: ["Let's file these properly.", "A tidy index is a happy index."],
    command: ["What are we looking for?", "I have read the whole index."],
  },
  moss: {
    danger: ["Moss is very still.", "Moss recommends a backup."],
    warning: ["Moss will hold it.", "It can come back. Moss waits."],
    restore: ["Moss checked the old leaves.", "This replaces the shelf."],
    share: ["A door in the moss.", "Moss will keep it damp."],
    link: ["Which leaf connects?", "Moss likes a thread."],
    pick: ["Where does it grow?", "Moss knows a spot."],
    tags: ["Small labels. Moss approves.", "Let's tidy the garden."],
    command: ["What are we looking for?", "Moss is listening."],
  },
};

/** A one-line hint shown while a confirmation button is hovered or focused. */
export const COMPANION_DIALOG_HINTS: Record<"cancel" | CompanionDialogTone, string> = {
  cancel: "Nothing will be changed.",
  danger: "This cannot be undone.",
  warning: "It can be restored from the trash.",
  restore: "This replaces notes with the same id.",
};
