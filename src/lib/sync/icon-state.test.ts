import { describe, expect, it } from "vitest";
import { syncIconState } from "./icon-state";

const base = {
  remoteEnabled: true,
  authStatus: "signed-in" as const,
  phase: "idle" as const,
  online: true,
};

describe("syncIconState", () => {
  it("hides without a backend or while the session is still loading", () => {
    expect(syncIconState({ ...base, remoteEnabled: false })).toBe("hidden");
    expect(syncIconState({ ...base, authStatus: "disabled" })).toBe("hidden");
    expect(syncIconState({ ...base, authStatus: "loading" })).toBe("hidden");
  });

  it("offers sign-in when signed out", () => {
    expect(syncIconState({ ...base, authStatus: "signed-out" })).toBe("signed-out");
  });

  it("reports offline before any sync phase", () => {
    expect(syncIconState({ ...base, online: false, phase: "syncing" })).toBe("offline");
  });

  it("maps the phase when online", () => {
    expect(syncIconState({ ...base, phase: "syncing" })).toBe("syncing");
    expect(syncIconState({ ...base, phase: "error" })).toBe("error");
    expect(syncIconState({ ...base, phase: "idle" })).toBe("saved");
  });
});
