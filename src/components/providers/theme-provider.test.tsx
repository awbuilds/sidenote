import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./theme-provider";
import { db } from "@/lib/db/db";

/**
 * The theme's persistence regression.
 *
 * `theme.ts` names IndexedDB the source of truth and localStorage a mirror, but
 * the mirror was the only place the choice was ever written. Two bugs followed:
 * a reload read `DEFAULT_SETTINGS.theme` ("dark") and lost the user's choice,
 * and every settings write mirrored that default back over it — so dismissing
 * the setup checklist reverted a light theme to dark.
 *
 * These tests pin the behaviour at the layer that broke: picking a theme must
 * land a row in the settings table.
 */

function Harness() {
  const { setTheme, setPack, resolved, pack } = useTheme();
  return (
    <>
      <button onClick={() => setTheme("light")} data-testid="light">
        {resolved}
      </button>
      <button onClick={() => setPack("gel")} data-testid="pack">
        {pack}
      </button>
    </>
  );
}

/** The repository is imported dynamically, so drain the microtask queue AND
 *  the Dexie write it schedules. Fake timers are not used: the write is real. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  // The import + put resolve after the first tick; poll briefly for the row.
  for (let i = 0; i < 50; i++) {
    if ((await db().settings.get("theme")) !== undefined) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

describe("ThemeProvider persistence", () => {
  beforeEach(async () => {
    await db().open();
    await db().settings.clear();
    localStorage.clear();
  });

  afterEach(async () => {
    await db().settings.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("writes the chosen theme to the settings table, not just localStorage", async () => {
    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );

    await act(async () => {
      screen.getByTestId("light").click();
    });
    await settle();

    const row = await db().settings.get("theme");
    expect(row?.value).toBe("light");
    // The mirror still drives the immediate UI update.
    expect(localStorage.getItem("sidenote:theme")).toBe("light");
  });

  it("persists the theme pack to the settings table", async () => {
    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );

    await act(async () => {
      screen.getByTestId("pack").click();
    });
    for (let i = 0; i < 50; i++) {
      if ((await db().settings.get("themePack")) !== undefined) break;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }

    expect((await db().settings.get("themePack"))?.value).toBe("gel");
    expect(localStorage.getItem("sidenote:theme-pack")).toBe("gel");
  });

  it("survives a reload: a fresh mount reads the persisted row, not the default", async () => {
    const first = render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );
    await act(async () => {
      screen.getByTestId("light").click();
    });
    await settle();
    first.unmount();

    // Simulate the boot sequence: localStorage is a cache, so it can disagree
    // with the row. IndexedDB must win.
    localStorage.setItem("sidenote:theme", "dark");

    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );
    await settle();

    // The row is still light, so the default cannot have overwritten the choice.
    expect((await db().settings.get("theme"))?.value).toBe("light");
  });
});