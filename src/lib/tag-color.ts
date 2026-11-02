export const TAG_COLORS = ["slate", "violet", "amber", "emerald", "rose", "sky"] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export function normalizeTagColor(value: string): TagColor {
  return (TAG_COLORS as readonly string[]).includes(value) ? (value as TagColor) : "slate";
}

export function tagDotClass(value: string): string {
  switch (normalizeTagColor(value)) {
    case "violet":
      return "bg-violet-500";
    case "amber":
      return "bg-amber-500";
    case "emerald":
      return "bg-emerald-500";
    case "rose":
      return "bg-rose-500";
    case "sky":
      return "bg-sky-500";
    default:
      return "bg-slate-400";
  }
}

export function tagChipClass(value: string): string {
  switch (normalizeTagColor(value)) {
    case "violet":
      return "bg-violet-500/10 text-violet-600 dark:text-violet-300";
    case "amber":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "emerald":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "rose":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-300";
    case "sky":
      return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}
