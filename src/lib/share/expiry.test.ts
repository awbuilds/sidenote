import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_EXPIRY, SHARE_EXPIRY_MAX_DAYS, SHARE_EXPIRY_OPTIONS } from "./expiry";

describe("share expiry options", () => {
  it("never offers a permanent link", () => {
    expect(SHARE_EXPIRY_OPTIONS.length).toBeGreaterThan(0);
    expect(SHARE_EXPIRY_OPTIONS.some((option) => /never/i.test(option.label))).toBe(false);
    expect(SHARE_EXPIRY_OPTIONS.every((option) => option.durationMs > 0)).toBe(true);
  });

  it("caps the longest choice at 30 days", () => {
    const longest = Math.max(...SHARE_EXPIRY_OPTIONS.map((option) => option.durationMs));
    expect(longest).toBe(SHARE_EXPIRY_MAX_DAYS * 24 * 60 * 60 * 1000);
  });

  it("has a default that is one of the choices", () => {
    expect(SHARE_EXPIRY_OPTIONS.some((option) => option.value === DEFAULT_SHARE_EXPIRY)).toBe(true);
  });
});
