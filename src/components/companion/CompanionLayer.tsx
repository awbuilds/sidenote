"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/queries";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  COMPANION_RUN_EVENT,
  DEFAULT_COMPANION,
} from "@/lib/companion";
import { CompanionPet } from "./CompanionPet";

const SESSION_KEY = "sidenote:companion-ran";

/**
 * Draws the companion when it is allowed to run.
 *
 * Runs are event-driven — once per browser session, plus an explicit
 * `requestCompanionRun()` after onboarding. There is no interval: a pet that
 * crosses the screen every ten minutes is a distraction, not a companion.
 */
export function CompanionLayer() {
  const { data: settings } = useSettings();
  const reduced = useReducedMotion();
  const [run, setRun] = useState(0);

  const enabled = (settings?.companionEnabled ?? false) && !reduced;
  const companionId = settings?.companionId ?? DEFAULT_COMPANION;

  useEffect(() => {
    if (!enabled) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) !== null) return;
    } catch {
      // Storage can be unavailable; a run per mount is better than none.
    }
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Ignore; see above.
      }
      setRun((value) => value + 1);
    }, 3_500);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onRun = () => setRun((value) => value + 1);
    window.addEventListener(COMPANION_RUN_EVENT, onRun);
    return () => window.removeEventListener(COMPANION_RUN_EVENT, onRun);
  }, [enabled]);

  if (!enabled || run === 0) return null;

  return (
    <div
      key={run}
      className="companion-run"
      onAnimationEnd={(event) => {
        // The pet's hop also bubbles an animationend; only the run itself
        // should unmount the layer.
        if (event.target === event.currentTarget) setRun(0);
      }}
    >
      <span className="companion-bob">
        <CompanionPet
          id={companionId}
          avatarClassName="size-14 drop-shadow-md"
          buttonClassName="p-1"
        />
      </span>
    </div>
  );
}
