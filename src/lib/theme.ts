/**
 * Theme resolution.
 *
 * The canonical value lives in IndexedDB (`settings.theme`), but IndexedDB is
 * async and a pre-paint script cannot read it. So the resolved theme is also
 * mirrored in `localStorage`, purely so the inline script in the root layout
 * can set the `dark` class before first paint and avoid a flash.
 *
 * localStorage is a cache here, never the source of truth. If it is
 * unavailable or out of sync, `applyTheme` simply corrects it.
 */

export type Theme = "light" | "dark" | "system";

/**
 * What is actually on screen, which is always a concrete theme.
 *
 * `amoled` was the former name of the dark palette. It is now simply `dark`;
 * `normalizeTheme` migrates stored values so nobody's preference is lost.
 */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "sidenote:theme";

/**
 * What a first-time visitor gets: the true-black dark theme.
 *
 * Declared once and referenced from all four places that used to hardcode
 * `"system"` independently — `DEFAULT_SETTINGS`, the provider's `initialTheme`
 * prop default, `SERVER_THEME`, and the pre-paint script's null branch. Four
 * copies of one default is four chances to disagree, and they had already
 * drifted once: the AppSettings union and the Theme union were separate
 * literals kept in step by hand.
 *
 * Note this is the default, not an override. A stored preference always wins,
 * including `"system"`, so nobody's existing choice is overwritten.
 */
export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Coerce a stored value into a current theme.
 *
 * `amoled` was the former name of the true-black dark palette, so old
 * localStorage mirrors and settings rows migrate to `dark` instead of falling
 * back to the default — or, worse, to a light theme on a light-mode machine.
 */
export function normalizeTheme(value: unknown): Theme | null {
  if (value === "amoled") return "dark";
  return isTheme(value) ? value : null;
}

export function readStoredTheme(): Theme | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredTheme(theme: Theme): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or a full quota. Not fatal — the class is still applied.
  }
  // localStorage writes do not fire `storage` in the writing tab, so
  // same-tab subscribers are notified explicitly.
  notifyThemeChanged();
}

export function prefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return prefersDark() ? "dark" : "light";
  return theme;
}

/** Apply the theme to the document and mirror it for the pre-paint script. */
export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    // `amoled` was the old name of this palette; a lingering class from before
    // the rename no longer matches anything, but clear it anyway.
    root.classList.remove("amoled");
    root.style.colorScheme = resolved === "dark" ? "dark" : "light";
  }

  // Deliberately does NOT write the mirror. `applyTheme` is called from the
  // provider's effect on the HYDRATION render, where `useSyncExternalStore`
  // returns the server snapshot (`null`) and `theme` is still the placeholder
  // `DEFAULT_THEME`. Persisting here wrote "dark" over a light choice roughly
  // 300ms after every reload, before the real value arrived from the store.
  // Persistence belongs to `writeStoredTheme`, called by the code that changes
  // the choice — never by the code that paints it.
  return resolved;
}

/**
 * Inline script for the root layout. Runs before paint, reading only the
 * localStorage mirror, so there is no flash of the wrong theme.
 *
 * The stored value is migrated first: `amoled` was the old name for the dark
 * palette and is treated as `dark`. Nothing stored means `DEFAULT_THEME` is
 * substituted, which is what makes the true-black dark theme the out-of-the-
 * box look; anything else, including `system`, goes through the media query.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(t==='amoled'){t='dark';}
if(t===null||t===''){t=${JSON.stringify(DEFAULT_THEME)};}
var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var r=document.documentElement;
r.classList.toggle('dark',d);
r.classList.remove('amoled');
r.style.colorScheme=d?'dark':'light';
}catch(e){}})();`;

/** Subscribe to OS-level theme changes. Returns an unsubscribe function. */
export function onSystemThemeChange(handler: (dark: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = (event: MediaQueryListEvent) => handler(event.matches);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/* ------------------------------------------------------------------ */
/* Store plumbing for useSyncExternalStore                             */
/* ------------------------------------------------------------------ */

/**
 * Notifies listeners that the stored theme changed.
 *
 * A custom event rather than a shared mutable set, so a theme written in one
 * tab and mirrored through `storage` reaches subscribers everywhere without
 * either side holding a reference to the other.
 */
const THEME_EVENT = "sidenote:theme-change";

export function notifyThemeChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Subscribe to theme changes from this tab and from other tabs.
 *
 * The `storage` event only fires in *other* tabs, so both are needed for the
 * mirror to stay honest when a second window writes.
 */
export function subscribeToTheme(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Subscribe to OS colour-scheme changes. */
export function subscribeToSystemTheme(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The server's answer, which is the only one it can give.
 *
 * The pre-paint script has already set the class, so this only decides what
 * React renders *during* hydration — and the client must reach the same
 * conclusion, or React throws and regenerates the tree. That was the documented
 * cause of the old /settings hydration failure, which is why `useSyncExternalStore`
 * exists here rather than a `useState` reading localStorage on first render.
 *
 * `SERVER_SYSTEM_DARK` is the honest answer for a machine with no matchMedia:
 * `false`. It is only consulted when the theme is `"system"`, and the default
 * is not, so it does not affect the first-run look.
 */
export const SERVER_THEME: Theme = DEFAULT_THEME;
export const SERVER_SYSTEM_DARK = false;
