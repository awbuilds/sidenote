"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Pane } from "@/hooks/useWorkspaceParams";

const BACK: Record<Pane, Pane | null> = {
  notebooks: null,
  notes: "notebooks",
  editor: "notes",
  // The attachments browser occupies the note list's slot, so back goes where
  // the list would have sent you.
  attachments: "notebooks",
};

const TITLES: Record<Pane, string> = {
  notebooks: "Notebooks",
  notes: "Notes",
  editor: "",
  attachments: "Attachments",
};

/**
 * Mobile chrome: a back affordance and the current pane's title. Hidden on
 * `lg` and up, where all three panes are visible at once and this would be
 * meaningless.
 */
export function MobilePaneHeader({
  pane,
  onBack,
  right,
}: {
  pane: Pane;
  onBack: (pane: Pane) => void;
  right?: ReactNode;
}) {
  const target = BACK[pane];

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 lg:hidden">
      {target ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onBack(target)}
          aria-label="Back"
        >
          <ChevronLeft className="size-4" />
        </Button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{TITLES[pane]}</h1>
      {right}
    </header>
  );
}

export function PaneVisibility({
  pane,
  active,
  className,
  exclusive = false,
  hidden = false,
  children,
}: {
  pane: Pane;
  active: Pane;
  className?: string;
  /**
   * Take the slot rather than adding to the row.
   *
   * By default every pane is visible on `lg` and up, which is the three-pane
   * layout. An exclusive pane shares another pane's slot — the attachments
   * browser sits where the note list is — so it must stay hidden when it is not
   * the active one even on a wide screen, or the two render side by side.
   */
  exclusive?: boolean;
  /**
   * Force this pane closed regardless of the active pane.
   *
   * Used to yield the note list's slot to another pane without making the list
   * itself exclusive — the list must stay visible on a wide screen when the
   * editor is the active pane, which is the whole three-pane layout.
   */
  hidden?: boolean;
  children: ReactNode;
}) {
  const shown = pane === active && !hidden;
  return (
    <div
      className={cn(
        "min-h-0 min-w-0 flex-col",
        shown ? "flex" : "hidden",
        // `lg:flex` is `display: flex` at the lg breakpoint, which beats
        // `display: none` from `hidden` — so a pane that is meant to be closed
        // must not be given it at all, or it reappears on a wide screen.
        exclusive || hidden ? null : "lg:flex",
        className,
      )}
    >
      {children}
    </div>
  );
}
