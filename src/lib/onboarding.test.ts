import { describe, expect, it } from "vitest";
import { shouldShowOnboarding } from "./onboarding";

describe("shouldShowOnboarding", () => {
  it("shows on a freshly seeded database", () => {
    expect(shouldShowOnboarding({ onboardingPending: true })).toBe(true);
  });

  it("never shows for an existing database", () => {
    expect(shouldShowOnboarding({ onboardingPending: false })).toBe(false);
  });

  it("shows again when replayed from settings", () => {
    expect(shouldShowOnboarding({ onboardingPending: true })).toBe(true);
  });
});
