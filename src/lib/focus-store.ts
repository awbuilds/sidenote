import { getSetting, setSetting } from "@/lib/db/repositories/settings";

/**
 * Focus mode as a shared external store.
 *
 * It used to be `useState` inside the hook, so `Workspace` (which hides the
 * panes), the editor toolbar button, and the floating toggle each held their
 * own copy. Toggling one persisted the setting but left the layout unchanged,
 * and a reload with focus on could not be escaped — the toggle wrote `false`
 * while the layout still read `true`. One store, read through `useFocusMode`,
 * keeps every consumer in step.
 */
const FOCUS_KEY = "focusMode" as const;

let focus = false;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeFocusMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFocusMode(): boolean {
  return focus;
}

/** Read the persisted choice once; later calls are no-ops. */
export async function loadFocusMode(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const value = await getSetting(FOCUS_KEY);
    if (typeof value === "boolean" && value !== focus) {
      focus = value;
      emit();
    }
  } catch {
    // A missing or unreadable setting means focus mode stays off.
  }
}

export function toggleFocusMode(): void {
  focus = !focus;
  emit();
  void setSetting(FOCUS_KEY, focus);
}

/** Test seam: forget the cached value and the load guard. */
export function __resetFocusStore(): void {
  focus = false;
  loaded = false;
  listeners.clear();
}
