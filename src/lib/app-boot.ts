/**
 * App boot signal.
 *
 * The splash screen needs to know when the app has taken over from the
 * server-rendered HTML. That is not the same as "the data is loaded" — the
 * panes already render skeletons while their queries resolve, and duplicating
 * that behind a full-screen overlay would just delay content the user could
 * already be reading.
 *
 * So "ready" means the shell is live: JavaScript parsed, React hydrated, the
 * first client render committed. A DOM event rather than a React context
 * because the splash lives in the root layout, above every provider, and a
 * context would mean lifting state across the RSC boundary to carry one
 * boolean.
 */
export const APP_READY_EVENT = "sidenote:ready";

/** Signal that the app shell is interactive. Safe to call more than once. */
export function markAppReady(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APP_READY_EVENT));
}
