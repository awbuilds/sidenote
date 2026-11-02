import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { SplashScreen } from "./SplashScreen";
import { markAppReady } from "@/lib/app-boot";

/**
 * The splash is a timing behaviour, so the timing is what gets tested.
 *
 * The bug this file exists for: `dismiss()` used to clear the minimum-duration
 * timer the moment the app reported in, so a fast machine skipped the floor
 * entirely and the splash blinked for ~200ms. The comment claimed a minimum
 * the code did not enforce. Nothing but a clock would have caught that.
 *
 * A second, later bug is guarded below: the progress bar and the splash were
 * both `z-50`, and the splash renders later, so the opaque overlay painted over
 * the bar and it could not be seen at all. That one was found by looking at the
 * screen, not by a test.
 *
 * The durations are internal, so they are restated here rather than imported.
 * If they change, this file should fail loudly rather than quietly pass.
 */

const MIN_MS = 550;
const FADE_MS = 300;

/** The splash is up (present and not fading). */
function splashVisible(): boolean {
  const el = document.querySelector("[data-splash]");
  return el !== null && el.getAttribute("data-splash") === "showing";
}

function splashState(): string | null {
  return document.querySelector("[data-splash]")?.getAttribute("data-splash") ?? null;
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SplashScreen timing", () => {
  it("shows before the app reports in", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);
    expect(splashVisible()).toBe(true);
  });

  it("stays up past the moment the app reports, if the floor has not passed", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);

    // The app is interactive almost immediately. The splash must not simply
    // vanish with it.
    advance(100);
    act(() => {
      markAppReady();
    });

    advance(100);
    expect(splashVisible()).toBe(true);
  });

  it("fades out once the floor has passed", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);

    advance(100);
    act(() => {
      markAppReady();
    });

    advance(MIN_MS);
    expect(splashState()).toBe("leaving");
  });

  it("is gone a fade after the floor", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);

    advance(100);
    act(() => {
      markAppReady();
    });
    advance(MIN_MS);
    advance(FADE_MS);

    expect(document.querySelector("[data-splash]")).toBeNull();
  });

  it("dismisses even if the app never reports", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);

    // A chunk 404s, an extension blocks something, the network drops. The user
    // must still get the app.
    advance(3000);
    advance(FADE_MS);

    expect(document.querySelector("[data-splash]")).toBeNull();
  });

  it("ignores a second ready signal", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);

    advance(100);
    act(() => {
      markAppReady();
      markAppReady();
    });
    advance(MIN_MS);
    advance(FADE_MS);

    expect(document.querySelector("[data-splash]")).toBeNull();
  });

  it("does not start a new cycle after it is gone", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);

    advance(100);
    act(() => {
      markAppReady();
    });
    advance(MIN_MS + FADE_MS);
    expect(document.querySelector("[data-splash]")).toBeNull();

    // A late event must not bring it back.
    act(() => {
      markAppReady();
    });
    expect(document.querySelector("[data-splash]")).toBeNull();
  });
});

describe("the progress bar", () => {
  it("is inside the splash, under the wordmark", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);

    const bar = document.querySelector("[data-boot-bar]");
    const mark = document.querySelector("[data-splash] > div");
    expect(bar).not.toBeNull();
    expect(mark).not.toBeNull();

    // It belongs to the lockup, not to the viewport edge: a bar pinned to the
    // top reads as browser chrome rather than as part of the app.
    expect(bar!.closest("[data-splash]")).not.toBeNull();
    // And it comes after the mark/wordmark block, so it sits below it.
    const position = mark!.compareDocumentPosition(bar!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is a share of the viewport rather than edge to edge", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);

    const bar = document.querySelector("[data-boot-bar]") as HTMLElement;
    expect(bar.style.width).toBe("60%");
  });

  it("has a track and a fill, so the empty part is visible", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);

    const track = document.querySelector("[data-boot-bar]") as HTMLElement;
    // A bare fill with no track would be invisible until it had travelled
    // somewhere, which is the same bug as before in a different costume.
    expect(track.children.length).toBe(1);
    expect([...track.classList]).toContain("bg-muted");
  });

  it("leaves with the splash, so neither outlives the other", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);

    advance(100);
    act(() => {
      markAppReady();
    });
    advance(MIN_MS + FADE_MS);

    expect(document.querySelector("[data-splash]")).toBeNull();
    expect(document.querySelector("[data-boot-bar]")).toBeNull();
  });
});
