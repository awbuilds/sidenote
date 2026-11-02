import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock("@/lib/db/repositories/settings", () => ({
  getSetting: h.getSetting,
  setSetting: h.setSetting,
}));

import {
  __resetFocusStore,
  getFocusMode,
  loadFocusMode,
  subscribeFocusMode,
  toggleFocusMode,
} from "./focus-store";

describe("focus store", () => {
  beforeEach(() => {
    __resetFocusStore();
    h.getSetting.mockReset();
    h.setSetting.mockReset();
  });

  it("loads the persisted choice once", async () => {
    h.getSetting.mockResolvedValue(true);

    await loadFocusMode();
    expect(getFocusMode()).toBe(true);

    h.getSetting.mockClear();
    await loadFocusMode();
    expect(h.getSetting).not.toHaveBeenCalled();
  });

  it("notifies every subscriber and persists on toggle", () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribeFocusMode(first);
    subscribeFocusMode(second);

    toggleFocusMode();

    expect(getFocusMode()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(h.setSetting).toHaveBeenCalledWith("focusMode", true);
  });

  it("keeps the runtime state after the persisted load", () => {
    const listener = vi.fn();
    subscribeFocusMode(listener);

    toggleFocusMode();
    expect(getFocusMode()).toBe(true);

    // Another consumer mounting must not re-read and clobber the live value.
    void loadFocusMode();
    expect(getFocusMode()).toBe(true);
  });
});
