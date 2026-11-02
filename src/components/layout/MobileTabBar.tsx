"use client";

import { useRouter } from "next/navigation";
import { Library, Search, StickyNote, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTrashedNotes } from "@/hooks/queries";
import { setCommandPaletteOpen } from "@/lib/ui-store";
import type { Pane } from "@/hooks/useWorkspaceParams";

/**
 * Mobile bottom navigation — the missing home for Notes/Notebooks/Search/Trash
 * on touch screens. Hidden on `lg` and in the editor pane, where the on-screen
 * keyboard needs the space.
 */
export function MobileTabBar({
  pane,
  onNavigate,
}: {
  pane: Pane;
  onNavigate: (pane: Pane) => void;
}) {
  const router = useRouter();
  const { data: trashed } = useTrashedNotes();
  const trashCount = trashed?.length ?? 0;

  const items = [
    {
      key: "notes",
      label: "Notes",
      icon: StickyNote,
      active: pane === "notes",
      onClick: () => onNavigate("notes"),
    },
    {
      key: "notebooks",
      label: "Notebooks",
      icon: Library,
      active: pane === "notebooks",
      onClick: () => onNavigate("notebooks"),
    },
    {
      key: "search",
      label: "Search",
      icon: Search,
      active: false,
      onClick: () => setCommandPaletteOpen(true),
    },
    {
      key: "trash",
      label: "Trash",
      icon: Trash2,
      active: false,
      badge: trashCount,
      onClick: () => router.push("/trash"),
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
            item.active ? "text-primary" : "text-muted-foreground",
          )}
        >
          <item.icon className="size-5" />
          {item.label}
          {item.badge !== undefined && item.badge > 0 && (
            <span className="absolute right-[22%] top-1 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-medium text-destructive-foreground">
              {item.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
