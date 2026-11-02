import { describe, expect, it } from "vitest";
import {
  backupReminder,
  deleteWarning,
  settingsSubtitle,
  toCopyAccountState,
  trashWarning,
} from "./copy";

describe("copy helpers", () => {
  it("treats loading as signed-out", () => {
    expect(toCopyAccountState("loading")).toBe("signed-out");
    expect(toCopyAccountState("disabled")).toBe("disabled");
    expect(toCopyAccountState("signed-in")).toBe("signed-in");
    expect(toCopyAccountState("signed-out")).toBe("signed-out");
  });

  it("never claims local-only while signed in", () => {
    for (const text of [settingsSubtitle("signed-in"), deleteWarning("signed-in"), backupReminder("signed-in")]) {
      expect(text.toLowerCase()).not.toContain("nothing is uploaded");
    }
    expect(settingsSubtitle("signed-in")).toContain("synced to your account");
    expect(deleteWarning("signed-in")).toContain("removes the synced copies");
  });

  it("keeps the local-only reassurance only when there is no account", () => {
    expect(settingsSubtitle("disabled")).toContain("no remote configured");
    expect(deleteWarning("disabled")).toContain("no server copy");
    expect(backupReminder("disabled")).toContain("only copy that exists");
  });

  it("warns signed-out users that synced copies are removed on next sync", () => {
    expect(deleteWarning("signed-out")).toContain("next time you sync");
  });

  it("keeps the trash warning truthful in every state", () => {
    expect(trashWarning("signed-in")).toContain("synced copy");
    expect(trashWarning("disabled")).toContain("only in this browser");
    expect(trashWarning("signed-out")).not.toContain("only copy outside it");
  });
});
