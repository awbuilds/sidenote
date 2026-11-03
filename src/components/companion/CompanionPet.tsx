"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { COMPANION_LINES, companionName, type CompanionId } from "@/lib/companion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { CompanionAvatar } from "./CompanionAvatar";

interface CompanionPetProps {
  id: CompanionId;
  className?: string;
  avatarClassName?: string;
  buttonClassName?: string;
  /** Anchor the bubble to the left edge when the pet sits near a pane edge. */
  bubbleAlign?: "center" | "start";
}

/**
 * The interactive version of the companion.
 *
 * Clicking it hops, says one line, and rotates through a short script. The
 * message is a live region so it is announced without stealing focus, and the
 * hop is skipped when the OS asks for reduced motion.
 */
export function CompanionPet({
  id,
  className,
  avatarClassName,
  buttonClassName,
  bubbleAlign = "center",
}: CompanionPetProps) {
  const reduced = useReducedMotion();
  const [pets, setPets] = useState(0);
  const [line, setLine] = useState<string | null>(null);
  const [hopKey, setHopKey] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const lines = COMPANION_LINES[id];
  const name = companionName(id);

  const pet = () => {
    const next = pets + 1;
    setPets(next);
    setLine(lines[(next - 1) % lines.length]);
    setHopKey((value) => value + 1);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLine(null), 2_800);
  };

  return (
    <span className={cn("companion-pet-wrap relative inline-flex", className)}>
      {line !== null && (
        <span
          role="status"
          aria-live="polite"
          className={cn("companion-bubble", bubbleAlign === "start" && "companion-bubble-start")}
        >
          {line}
        </span>
      )}
      <button
        type="button"
        onClick={pet}
        aria-label={`Pet ${name}`}
        title={`Pet ${name}`}
        data-companion-pet={id}
        className={cn(
          "companion-pet inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          buttonClassName,
        )}
      >
        <span key={hopKey} className={cn(!reduced && "companion-hop")}>
          <CompanionAvatar id={id} className={avatarClassName} label={name} />
        </span>
      </button>
    </span>
  );
}
