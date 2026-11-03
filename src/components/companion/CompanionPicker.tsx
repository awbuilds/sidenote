"use client";

import { cn } from "@/lib/utils";
import { COMPANIONS, type CompanionId } from "@/lib/companion";
import { CompanionAvatar } from "./CompanionAvatar";

interface CompanionPickerProps {
  value: CompanionId;
  onChange: (id: CompanionId) => void;
  className?: string;
}

/** Four original pets, rendered as a radio group. */
export function CompanionPicker({ value, onChange, className }: CompanionPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Companion"
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}
    >
      {COMPANIONS.map((companion) => {
        const selected = companion.id === value;
        return (
          <button
            key={companion.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(companion.id)}
            className={cn(
              "group flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors",
              "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-primary bg-accent/70" : "border-border",
            )}
          >
            <span
              className={cn(
                "transition-transform group-hover:-translate-y-0.5",
                selected && "scale-110",
              )}
            >
              <CompanionAvatar id={companion.id} className="size-10" />
            </span>
            <span className="text-xs font-medium">{companion.name}</span>
            <span className="text-[10px] leading-tight text-muted-foreground">
              {companion.blurb}
            </span>
          </button>
        );
      })}
    </div>
  );
}
