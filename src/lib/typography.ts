export type EditorFont = "sans" | "serif" | "mono";
export type EditorWidth = "narrow" | "medium" | "wide";
export type EditorLineHeight = "compact" | "normal" | "relaxed";

export const EDITOR_FONT_LABELS: Record<EditorFont, string> = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
};

export const EDITOR_WIDTH_LABELS: Record<EditorWidth, string> = {
  narrow: "Narrow",
  medium: "Medium",
  wide: "Wide",
};

export const EDITOR_LINE_HEIGHT_LABELS: Record<EditorLineHeight, string> = {
  compact: "Compact",
  normal: "Normal",
  relaxed: "Relaxed",
};

/** `ch` is the right unit for a reading measure; 72ch is the default. */
const WIDTH_CLASS: Record<EditorWidth, string> = {
  narrow: "max-w-[60ch]",
  medium: "max-w-[72ch]",
  wide: "max-w-[84ch]",
};

const FONT_CLASS: Record<EditorFont, string> = {
  sans: "font-sans",
  serif: "font-serif",
  mono: "font-mono",
};

const LINE_CLASS: Record<EditorLineHeight, string> = {
  compact: "leading-snug",
  normal: "leading-normal",
  relaxed: "leading-relaxed",
};

/** Classes for the editor's centered reading column (title + content). */
export function editorTypographyClass(input: {
  font: EditorFont;
  width: EditorWidth;
  lineHeight: EditorLineHeight;
}): string {
  return [WIDTH_CLASS[input.width], FONT_CLASS[input.font], LINE_CLASS[input.lineHeight]].join(" ");
}
