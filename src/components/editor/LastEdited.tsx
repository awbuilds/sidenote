"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime, relativeTime } from "@/lib/format";

/**
 * When the note was last changed.
 *
 * Shows a relative time, because "2 hours ago" answers the question people
 * actually have — is this the version I left — and the absolute timestamp is one
 * click away for when it does not.
 *
 * The relative label is re-computed on a timer rather than only on render: a
 * note left open says "just now" forever otherwise, which is a small lie that
 * gets more noticeable the longer the tab stays open.
 */
export function LastEdited({ timestamp }: { timestamp: number }) {
  // Tagged with the timestamp it was computed from: when the note changes the
  // label is derived during render, and afterwards the timer keeps it fresh.
  // Resetting it in an effect instead would show the previous note's age for a
  // frame — and the React Compiler lint rule rejects it outright.
  const [state, setState] = useState(() => ({
    at: timestamp,
    label: relativeTime(timestamp),
  }));
  const label = state.at === timestamp ? state.label : relativeTime(timestamp);

  useEffect(() => {
    // Once a minute is often enough for "5 minutes ago" and cheap enough to
    // leave running. Cleared on unmount and whenever the note changes.
    const timer = setInterval(
      () => setState({ at: timestamp, label: relativeTime(timestamp) }),
      60_000,
    );
    return () => clearInterval(timer);
  }, [timestamp]);

  if (timestamp <= 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground"
        >
          <Clock className="size-3.5" />
          {/* The absolute timestamp, as the reference shows it. "1h" is the
              friendlier answer to "is this what I left" but the date is what
              you read when comparing two notes, so it goes inline. */}
          <span className="tabular-nums">{formatDateTime(timestamp)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Last edited</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="justify-between gap-4">
          When <span className="text-muted-foreground">{label}</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="justify-between gap-4">
          Exactly{" "}
          <span className="truncate text-muted-foreground">{formatDateTime(timestamp)}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
