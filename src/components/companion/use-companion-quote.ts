"use client";

import { useState } from "react";

/**
 * The quote line a presenting pet shows, and the hop state for its button.
 *
 * The alert wrapper also uses `setHint` to show a consequence while the user
 * hovers or focuses a confirm/cancel button. Clicking the pet clears the hint
 * and moves to the next line, so the pet can always be petted out of a hint.
 */
export function useCompanionQuote(lines: string[]) {
  const [index, setIndex] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [hopKey, setHopKey] = useState(0);

  const quote = hint ?? (lines.length === 0 ? "" : lines[index % lines.length]);

  const pet = () => {
    setIndex((value) => value + 1);
    setHint(null);
    setHopKey((value) => value + 1);
  };

  return { quote, hint, setHint, pet, hopKey };
}
