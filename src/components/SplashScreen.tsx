"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { APP_READY_EVENT } from "@/lib/app-boot";
import { cn } from "@/lib/utils";

/**
 * A splash on every load, with a progress bar under the wordmark.
 *
 * Rendered by the root layout, so it appears on every route and is present in
 * the server-rendered HTML — which is the point. A splash that mounts *after*
 * hydration is a flash of the wrong thing, not a splash.
 *
 * The bar is a single CSS animation and needs no JavaScript to run, so it is
 * already moving before this component hydrates.
 */

/**
 * Longest the splash will ever stay up.
 *
 * A hard cap, not a wait. If hydration stalls — a chunk 404s, an extension
 * blocks something, the network drops — the user must still get the app. A
 * loading screen that can strand someone is worse than no loading screen.
 */
const MAX_MS = 3000;

/**
 * Shortest the splash stays up.
 *
 * Deliberate, and worth being honest about: this is a floor, not a real wait.
 * The app is usually interactive in well under a tenth of a second, and a
 * splash that appears and vanishes in 80ms reads as a rendering glitch rather
 * than an intro. Half a second is short enough that nobody reads it as slow and
 * long enough that it reads as intentional.
 */
const MIN_MS = 550;

/** Time the fade-out takes, matched to the `duration-300` below. */
const FADE_MS = 300;

/**
 * The bar's track, as a share of the viewport.
 *
 * Not the full width: a edge-to-edge bar reads as browser chrome — a page-load
 * indicator — rather than as part of the app's own lockup.
 */
const TRACK_WIDTH = "60%";

/**
 * Fades out once the app is ready, subject to a floor and a cap.
 *
 * The floor is a genuine minimum, not a fallback. An earlier version cleared it
 * the moment the app reported in, so a fast machine skipped it entirely and the
 * splash blinked for about 200ms. The comment claimed a minimum the code did
 * not enforce, which is worse than having neither.
 */
function useBootDismiss(): { leaving: boolean; gone: boolean } {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const startedAt = performance.now();
    let requested = false;
    let floorTimer: ReturnType<typeof setTimeout> | undefined;
    let capTimer: ReturnType<typeof setTimeout> | undefined;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;

    function finish() {
      window.removeEventListener(APP_READY_EVENT, request);
      if (capTimer !== undefined) clearTimeout(capTimer);
      capTimer = undefined;

      setLeaving(true);
      fadeTimer = setTimeout(() => setGone(true), FADE_MS);
    }

    function request() {
      if (requested) return;
      requested = true;

      // The floor is a floor: the app reporting in early schedules the fade for
      // whenever the floor expires, rather than cutting it short.
      const elapsed = performance.now() - startedAt;
      floorTimer = setTimeout(finish, Math.max(0, MIN_MS - elapsed));
    }

    window.addEventListener(APP_READY_EVENT, request);
    // In case the ready event never arrives at all.
    capTimer = setTimeout(finish, MAX_MS);

    return () => {
      window.removeEventListener(APP_READY_EVENT, request);
      if (floorTimer !== undefined) clearTimeout(floorTimer);
      if (capTimer !== undefined) clearTimeout(capTimer);
      if (fadeTimer !== undefined) clearTimeout(fadeTimer);
    };
  }, []);

  return { leaving, gone };
}

export function SplashScreen() {
  const { leaving, gone } = useBootDismiss();
  if (gone) return null;

  return (
    <div
      // Decorative, and hidden from assistive tech throughout: it says nothing
      // the page does not already say, and a screen reader announcing
      // "loading" on every navigation is noise.
      aria-hidden="true"
      data-splash={leaving ? "leaving" : "showing"}
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-background",
        "transition-opacity duration-300 ease-out motion-reduce:transition-none",
        leaving ? "pointer-events-none opacity-0" : "opacity-100",
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-xl border bg-card",
            // A slow, small pulse. Enough to read as "working", not enough to
            // be the thing you look at.
            "animate-[splash-pulse_1.6s_ease-in-out_infinite]",
            "motion-reduce:animate-none",
          )}
        >
          <Star className="size-6 fill-foreground/10" />
        </span>

        {/* Elongated caps: uppercase with wide tracking. The `pl` matches the
            tracking so the block stays optically centred — letter-spacing adds
            a trailing gap after the last letter, which otherwise pushes the
            wordmark visibly left of centre. */}
        <span className="pl-[0.42em] text-xl font-semibold uppercase tracking-[0.42em]">
          Sidenote
        </span>
        <span className="pl-[0.22em] text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">
          A private, local-first notebook
        </span>
      </div>

      {/* Under the lockup rather than pinned to the top edge. `w-[60%]` of the
          overlay, which is the viewport, and centred by the column above. */}
      <div
        data-boot-bar={leaving ? "leaving" : "running"}
        role="presentation"
        style={{ width: TRACK_WIDTH }}
        className="h-[3px] overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full w-full origin-left rounded-full",
            // Bright across its length with a soft tail, rather than a dim-to-
            // bright ramp. At 100% a ramp reads as a bar that is only partly
            // filled — a progress bar's fill has to look full when it is full.
            "bg-gradient-to-r from-primary/70 via-primary to-primary",
            // Completes inside the floor below, so the fill reaches the end and
            // holds for a moment rather than being cut off mid-sweep by the
            // fade. A 700ms sweep never finished before the 550ms floor.
            "animate-[boot-bar_450ms_cubic-bezier(0.16,1,0.3,1)_forwards]",
            // With the animation disabled the fill would sit at scaleX(0) and
            // read as a bar that never moves, so it starts full instead.
            "motion-reduce:animate-none motion-reduce:scale-x-100",
          )}
        />
      </div>
    </div>
  );
}
