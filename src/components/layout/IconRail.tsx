"use client";

import { ChevronsLeft, HardDriveDownload, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTrashedNotes } from "@/hooks/queries";
import { SyncStatusButton } from "@/components/sync/SyncStatusButton";
import { GitHubLink } from "@/components/GitHubLink";

/**
 * Compact icon rail.
 *
 * Replaces the full sidebar when collapsed: the note list and editor stay
 * visible and navigation becomes icons, which is the point of collapsing
 * rather than hiding.
 *
 * Only destinations that exist as routes get a rail entry. Attachments, tags
 * and tables in the reference are browser-specific views we do not have, so
 * they are absent rather than dead.
 */
export function IconRail({
  onExpand,
  trashActive,
}: {
  onExpand: () => void;
  trashActive: boolean;
}) {
  const { data: trashed } = useTrashedNotes();
  const trashCount = trashed?.length ?? 0;

  return (
    <nav aria-label="Primary" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r py-2">
      <RailButton label="Expand sidebar" onClick={onExpand}>
        <ChevronsLeft className="size-4" />
      </RailButton>

      <div className="my-1 h-px w-6 bg-border" />

      <RailButton
        label="Trash"
        onClick={() => undefined}
        active={trashActive}
        badge={trashCount > 0 ? trashCount : undefined}
        disabled
      >
        <Trash2 className="size-4" />
      </RailButton>

      <div className="flex-1" />

      <RailButton label="Backup and settings" href="/settings">
        <HardDriveDownload className="size-4" />
      </RailButton>
      <RailButton label="Settings" href="/settings">
        <Settings className="size-4" />
      </RailButton>
      <GitHubLink className="size-9" />
      <SyncStatusButton variant="rail" />
    </nav>
  );
}

function RailButton({
  label,
  href,
  onClick,
  active,
  badge,
  disabled,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  badge?: number;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const className = cn(
    "relative size-9",
    active && "bg-accent text-accent-foreground",
    disabled && "opacity-40",
  );

  const inner = (
    <>
      {children}
      {badge !== undefined && (
        <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-medium text-destructive-foreground">
          {badge}
        </span>
      )}
    </>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href !== undefined ? (
          <Button variant="ghost" size="icon" className={className} aria-label={label} asChild>
            <Link href={href}>{inner}</Link>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={className}
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
          >
            {inner}
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}