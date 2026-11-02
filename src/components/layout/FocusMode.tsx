"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getFocusMode,
  loadFocusMode,
  subscribeFocusMode,
  toggleFocusMode,
} from "@/lib/focus-store";

/**
 * Focus mode.
 *
 * Hides the notebook and list panes so only the editor is visible. The setting
 * persists, because a writing mode you have to re-enter every session is not
 * much of a mode.
 *
 * The state lives in a shared store, not in this hook: every consumer —
 * `Workspace`, the editor toolbar and the floating toggle — must see the same
 * answer, or the toggle stops controlling the layout.
 */
export function useFocusMode(): [boolean, () => void] {
  const focus = useSyncExternalStore(subscribeFocusMode, getFocusMode, () => false);

  useEffect(() => {
    void loadFocusMode();
  }, []);

  return [focus, toggleFocusMode];
}

export function FocusToggle() {
  const [focus, toggle] = useFocusMode();

  // ⌘⇧F toggles, matching what most editors use for full-screen.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (!event.shiftKey) return;
      event.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={focus ? "Leave focus mode" : "Enter focus mode"}
          aria-pressed={focus}
          onClick={toggle}
        >
          {focus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {focus ? "Leave focus mode" : "Focus mode"} · ⌘⇧F
      </TooltipContent>
    </Tooltip>
  );
}
