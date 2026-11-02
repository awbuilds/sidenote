"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME,
  SERVER_SYSTEM_DARK,
  SERVER_THEME,
  applyTheme,
  isTheme,
  prefersDark,
  readStoredTheme,
  subscribeToSystemTheme,
  subscribeToTheme,
  writeStoredTheme,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

/**
 * Persist the choice to the database, which `theme.ts` names as the source of
 * truth, then re-assert the localStorage mirror.
 *
 * Without this the theme never leaves localStorage, and two bugs follow:
 * a reload reads `DEFAULT_SETTINGS.theme` ("dark") from IndexedDB and drops the
 * user's choice, and every settings write mirrors that default back over the
 * mirror — so dismissing the setup checklist reverted a light theme to dark.
 * `useUpdateSettings`' mirror is correct only once the row exists.
 *
 * The repository is imported dynamically so Dexie stays out of this module's
 * static graph: the provider is imported during SSR/prerender, and
 * `src/lib/db/` may only be reached from the browser. The UI has already
 * updated by the time this settles, so it is deliberately not awaited.
 */
function persistTheme(theme: Theme): void {
  void import("@/lib/db/repositories/settings")
    .then(({ setSetting }) => setSetting("theme", theme))
    .then(() => writeStoredTheme(theme))
    .catch(() => {
      // Storage can be evicted or unavailable. The mirror still holds the
      // choice for this session, which is the pre-existing behaviour.
    });
}

interface ThemeContextValue {
  /** The user's choice, including `system`. */
  theme: Theme;
  /** What is actually on screen right now. */
  resolved: ResolvedTheme;
  setTheme: (next: Theme) => void;
  /** Flip between light and dark, resolving `system` first. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Theme, read as an external store.
 *
 * It used to be `useState(() => readStoredTheme())`, reading localStorage
 * during the first render. That is the documented cause of the hydration
 * failure on /settings: the server has no localStorage and no matchMedia, so it
 * rendered `light`, while the client's first render saw the real value and
 * rendered `dark`. React threw, and regenerated the whole tree.
 *
 * `useSyncExternalStore` is built for exactly this. It takes a server snapshot
 * and uses it for the hydration render, so both sides agree; the real value
 * arrives immediately after, in the same commit. There is no visible flash
 * because the pre-paint script has already set the class on `<html>` — only
 * React's knowledge of the theme lags by one render, and nothing paints from
 * that.
 */
export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME,
}: {
  children: ReactNode;
  initialTheme?: Theme;
}) {
  const stored = useSyncExternalStore<Theme | null>(
    subscribeToTheme,
    () => readStoredTheme(),
    () => null,
  );

  const systemDark = useSyncExternalStore<boolean>(
    subscribeToSystemTheme,
    prefersDark,
    () => SERVER_SYSTEM_DARK,
  );

  // A store read during hydration is the server's; the client's arrives on the
  // next commit, so the prop only seeds the very first value.
  const theme = stored ?? initialTheme ?? SERVER_THEME;

  const resolved: ResolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // The only thing this effect does is touch the DOM. State is derived above.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    if (!isTheme(next)) return;
    // The localStorage mirror is the source `readStoredTheme` reads, so
    // writing it is what notifies every subscriber.
    writeStoredTheme(next);
    persistTheme(next);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = resolved === "dark" ? "light" : "dark";
    writeStoredTheme(next);
    persistTheme(next);
  }, [resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return context;
}
