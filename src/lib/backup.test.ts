import { describe, expect, it } from "vitest";
import { BACKUP_STALE_CHANGES, BACKUP_STALE_DAYS, backupHealth } from "./backup";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function input(overrides: Partial<Parameters<typeof backupHealth>[0]> = {}) {
  return {
    lastBackupAt: NOW - DAY,
    lastBackupDataVersion: 10,
    dataVersion: 12,
    ...overrides,
  };
}

describe("backupHealth", () => {
  it("reports never-backed-up", () => {
    const health = backupHealth(input({ lastBackupAt: null }), NOW);
    expect(health.state).toBe("none");
    expect(health.daysSince).toBeNull();
  });

  it("treats a recent export with few changes as fresh", () => {
    const health = backupHealth(input(), NOW);
    expect(health.state).toBe("fresh");
    expect(health.daysSince).toBe(1);
    expect(health.changesSince).toBe(2);
  });

  it("goes stale after a week", () => {
    const health = backupHealth(
      input({ lastBackupAt: NOW - (BACKUP_STALE_DAYS + 1) * DAY, dataVersion: 10 }),
      NOW,
    );
    expect(health.state).toBe("stale");
  });

  it("goes stale after a burst of changes, even on the same day", () => {
    const health = backupHealth(
      input({ dataVersion: 10 + BACKUP_STALE_CHANGES }),
      NOW,
    );
    expect(health.state).toBe("stale");
    expect(health.changesSince).toBe(BACKUP_STALE_CHANGES);
  });

  it("does not go backwards when the export recorded a newer version", () => {
    const health = backupHealth(input({ lastBackupDataVersion: 99 }), NOW);
    expect(health.changesSince).toBe(0);
    expect(health.state).toBe("fresh");
  });

  it("still reports staleness when the export predates change tracking", () => {
    const health = backupHealth(input({ lastBackupDataVersion: null }), NOW);
    expect(health.changesSince).toBeNull();
    expect(health.state).toBe("fresh");
  });
});
