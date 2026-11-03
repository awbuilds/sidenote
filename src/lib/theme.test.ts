import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  DEFAULT_THEME_PACK,
  SERVER_THEME,
  THEME_INIT_SCRIPT,
  THEME_PACK_STORAGE_KEY,
  applyTheme,
  isTheme,
  isThemePack,
  normalizeTheme,
  normalizeThemePack,
  prefersDark,
  readStoredTheme,
  readStoredThemePack,
  resolveTheme,
  writeStoredTheme,
  writeStoredThemePack,
  type Theme,
} from "./theme";
import type { AppSettings } from "./db/types";
import { DEFAULT_SETTINGS } from "./db/types";

/**
 * The pre-paint script reads only the localStorage mirror, because IndexedDB is
 * async and cannot be read before first paint. That makes the mirror a real
 * correctness concern: if it drifts, the page flashes the wrong theme.
 */
function mockMatchMedia(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("isTheme", () => {
  it("accepts the three options and nothing else", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(true);
    // The old name of the dark palette is no longer a theme.
    expect(isTheme("amoled")).toBe(false);
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe("normalizeTheme", () => {
  it("migrates the legacy amoled value to dark", () => {
    expect(normalizeTheme("amoled")).toBe("dark");
  });

  it("passes current values through and rejects the rest", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("system")).toBe("system");
    expect(normalizeTheme("chartreuse")).toBeNull();
    expect(normalizeTheme(null)).toBeNull();
    expect(normalizeTheme(undefined)).toBeNull();
  });
});

describe("resolveTheme", () => {
  it("passes explicit choices through", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves system through the media query", () => {
    mockMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");

    mockMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("localStorage mirror", () => {
  it("round-trips a theme", () => {
    writeStoredTheme("dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("migrates a legacy amoled value on read", () => {
    localStorage.setItem("sidenote:theme", "amoled");
    expect(readStoredTheme()).toBe("dark");
  });

  it("returns null for a missing or invalid value", () => {
    localStorage.removeItem("sidenote:theme");
    expect(readStoredTheme()).toBeNull();

    localStorage.setItem("sidenote:theme", "chartreuse");
    expect(readStoredTheme()).toBeNull();
  });

  it("does not throw when localStorage is unavailable", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("denied");
    };
    expect(readStoredTheme()).toBeNull();
    Storage.prototype.getItem = original;
  });
});

describe("applyTheme", () => {
  it("sets and removes the dark class on the document", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  /**
   * Painting must never persist.
   *
   * The provider calls `applyTheme` on the HYDRATION render, where the theme is
   * still the `DEFAULT_THEME` placeholder. Persisting there wrote "dark" over a
   * light choice shortly after every reload. `applyTheme` now only touches the
   * DOM; `writeStoredTheme` is for the code that changes the choice.
   */
  it("does NOT write the mirror", () => {
    writeStoredTheme("light");
    applyTheme("dark");
    expect(readStoredTheme()).toBe("light");
  });

  // A stale `amoled` class from a build before the rename must not survive a
  // theme change; the only class a dark page may carry is `dark`.
  it("strips a legacy amoled class", () => {
    document.documentElement.className = "dark amoled";
    applyTheme("dark");
    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("amoled")).toBe(false);

    document.documentElement.className = "dark amoled";
    applyTheme("light");
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.classList.contains("amoled")).toBe(false);
  });
});

describe("prefersDark", () => {
  it("reads the media query", () => {
    mockMatchMedia(true);
    expect(prefersDark()).toBe(true);
    mockMatchMedia(false);
    expect(prefersDark()).toBe(false);
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("is self-contained and reads only the localStorage mirror", () => {
    expect(THEME_INIT_SCRIPT).toContain("sidenote:theme");
    expect(THEME_INIT_SCRIPT).toContain("classList.toggle('dark'");
    // Must not touch IndexedDB — it runs before the app exists.
    expect(THEME_INIT_SCRIPT).not.toContain("indexedDB");
    expect(THEME_INIT_SCRIPT).not.toContain("dexie");
  });

  it("runs without throwing in a bare environment", () => {
    mockMatchMedia(true);
    localStorage.clear();
    const run = new Function(THEME_INIT_SCRIPT);
    expect(() => run()).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // `amoled` was the old stored value for the dark palette. A light-mode
  // machine must not turn it light: it migrates to `dark` and stays dark.
  it("migrates a stored amoled choice to dark before paint", () => {
    localStorage.setItem("sidenote:theme", "amoled");
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";

    new Function(THEME_INIT_SCRIPT)();

    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("amoled")).toBe(false);
    expect(root.style.colorScheme).toBe("dark");
  });

  it("drops a stale amoled class when the stored choice is light", () => {
    writeStoredTheme("light");
    document.documentElement.className = "dark amoled";
    document.documentElement.style.colorScheme = "dark";

    new Function(THEME_INIT_SCRIPT)();

    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.classList.contains("amoled")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });

  // The first-run case: nothing in localStorage, so the default applies. This
  // is what makes a brand-new visitor land on the true-black dark theme rather
  // than whatever the OS happens to be set to.
  it("falls back to the default when nothing has been stored", () => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";

    new Function(THEME_INIT_SCRIPT)();

    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("amoled")).toBe(false);
    expect(root.style.colorScheme).toBe("dark");
  });

  // The other half of "unless that user has set the preference": a stored value
  // must win over the default, including an explicit `system`.
  it("never overrides a stored preference with the default", () => {
    mockMatchMedia(true);
    for (const stored of ["light", "dark", "system"] as const) {
      writeStoredTheme(stored);
      document.documentElement.className = "";
      document.documentElement.style.colorScheme = "";

      new Function(THEME_INIT_SCRIPT)();

      const root = document.documentElement;
      expect(root.classList.contains("amoled")).toBe(false);
      if (stored === "light") {
        expect(root.classList.contains("dark")).toBe(false);
      } else {
        // `dark` explicitly, and `system` on a machine that reports dark.
        expect(root.classList.contains("dark")).toBe(true);
      }
    }
  });
});

describe("the default theme", () => {
  it("is the true-black dark theme", () => {
    expect(DEFAULT_THEME).toBe("dark");
  });

  // Four places used to hardcode `"system"` independently — the settings
  // default, the provider's prop default, the server snapshot, and the
  // pre-paint script's null branch. They had already drifted once, so they now
  // all read from this one constant.
  it("is what every layer falls back to", () => {
    expect(SERVER_THEME).toBe(DEFAULT_THEME);
    expect(DEFAULT_SETTINGS.theme).toBe(DEFAULT_THEME);
    expect(isTheme(DEFAULT_THEME)).toBe(true);
  });
});

describe("the default theme is applied only when nothing is stored", () => {
  /**
   * The whole matrix, in one table, because the interesting behaviour is the
   * *interaction* between three inputs: what is stored, what the OS reports,
   * and what the pre-paint script does about it. Asserting one case at a time
   * hides which input actually decided the outcome.
   *
   * `[stored, osDark, expectsDark]`
   */
  const CASES: Array<[Theme | "amoled" | undefined, boolean, boolean]> = [
    // First run — no preference stored. Dark regardless of the OS, which is
    // the whole point: it must not follow a light-mode machine.
    [undefined, false, true],
    [undefined, true, true],

    // An explicit choice always wins, including `system` following the OS.
    ["light", false, false],
    ["light", true, false],
    ["dark", false, true],
    ["dark", true, true],
    ["system", false, false],
    ["system", true, true],

    // The legacy name migrates to `dark`; it must not follow the OS either.
    ["amoled", false, true],
    ["amoled", true, true],
  ];

  it.each(CASES)(
    "stored=%s osDark=%s -> dark=%s",
    (stored, osDark, expectsDark) => {
      mockMatchMedia(osDark);
      if (stored === undefined) localStorage.clear();
      else if (stored === "amoled") localStorage.setItem("sidenote:theme", stored);
      else writeStoredTheme(stored);

      // Start from a hostile state: the previous theme's classes still on the
      // element. A bug that fails to *remove* `amoled` would otherwise pass
      // whenever the test happened to start on a light theme.
      document.documentElement.className = "dark amoled";
      document.documentElement.style.colorScheme = "dark";

      new Function(THEME_INIT_SCRIPT)();

      const root = document.documentElement;
      expect(root.classList.contains("dark")).toBe(expectsDark);
      expect(root.classList.contains("amoled")).toBe(false);
      expect(root.style.colorScheme).toBe(expectsDark ? "dark" : "light");
    },
  );
});

describe("theme values", () => {
  it("accepts every option the UI offers", () => {
    const values: Theme[] = ["light", "dark", "system"];
    expect(values.every(isTheme)).toBe(true);
  });

  // The old version of this test compared a hardcoded array against itself, so
  // it passed no matter what `Theme` actually contained — it could not have
  // caught the two unions diverging. `AppSettings["theme"]` is now a reference
  // to `Theme` rather than a second literal, and this asserts the link.
  it("keeps the persisted settings union in step", () => {
    const persisted: AppSettings["theme"][] = ["light", "dark", "system"];
    expect(persisted.every(isTheme)).toBe(true);

    // One direction of the assignability holds by construction; this asserts
    // the value the settings row defaults to is still a legal theme.
    expect(isTheme(DEFAULT_SETTINGS.theme)).toBe(true);
  });

  it("rejects a value that is not one of the three", () => {
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme("AMOLED")).toBe(false);
    expect(isTheme("amoled")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe("theme packs", () => {
  it("accepts the four packs and rejects anything else", () => {
    expect(isThemePack("paper")).toBe(true);
    expect(isThemePack("blue")).toBe(true);
    expect(isThemePack("glass")).toBe(true);
    expect(isThemePack("gel")).toBe(true);
    expect(isThemePack("xp")).toBe(false);
    expect(isThemePack(null)).toBe(false);
  });

  it("falls back to Warm Paper for unknown values", () => {
    expect(normalizeThemePack("gel")).toBe("gel");
    expect(normalizeThemePack("windows")).toBe(DEFAULT_THEME_PACK);
    expect(DEFAULT_THEME_PACK).toBe("paper");
  });

  it("round-trips through the localStorage mirror", () => {
    writeStoredThemePack("glass");
    expect(readStoredThemePack()).toBe("glass");
    expect(localStorage.getItem(THEME_PACK_STORAGE_KEY)).toBe("glass");
  });

  it("applies the pack attribute alongside the dark class", () => {
    applyTheme("dark", "blue");
    const root = document.documentElement;
    expect(root.getAttribute("data-theme-pack")).toBe("blue");
    expect(root.classList.contains("dark")).toBe(true);

    applyTheme("light", "gel");
    expect(root.getAttribute("data-theme-pack")).toBe("gel");
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("is applied by the pre-paint script", () => {
    localStorage.clear();
    writeStoredThemePack("glass");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.getAttribute("data-theme-pack")).toBe("glass");
  });

  it("falls back to the default pack before paint", () => {
    localStorage.removeItem(THEME_PACK_STORAGE_KEY);
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.getAttribute("data-theme-pack")).toBe(
      DEFAULT_THEME_PACK,
    );
  });

  it("keeps the persisted settings pack in step", () => {
    expect(DEFAULT_SETTINGS.themePack).toBe(DEFAULT_THEME_PACK);
    expect(isThemePack(DEFAULT_SETTINGS.themePack)).toBe(true);
  });
});
