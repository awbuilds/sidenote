"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A plain navigation row in the sidebar. Kept out of NotebookTree so the
 *  sidebar's fixed sections and the notebook tree can change independently. */
export function SidebarSection({
  icon,
  label,
  active,
  onClick,
  count,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-8 w-full justify-start gap-2 px-3 text-sm font-normal",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50",
      )}
    >
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs tabular-nums opacity-60">{count}</span>
      )}
    </Button>
  );
}
