import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestDb } from "@/lib/db/test-helpers";
import { db } from "@/lib/db/db";
import { isUuid } from "@/lib/uuid";

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  reconcile: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({ auth: { getSession: h.getSession } }),
  isRemoteEnabled: () => true,
}));

vi.mock("./engine", () => ({ reconcile: h.reconcile }));

import { getSyncStatus, setSyncStatus } from "./status";
import { __resetSyncTrigger, __setReloadHandler, runSync, uuidErrorValue } from "./trigger";

describe("uuidErrorValue", () => {
  it("extracts the offending value from a Postgres uuid rejection", () => {
    expect(
      uuidErrorValue('invalid input syntax for type uuid: "seed-notebook-engineering"'),
    ).toBe("seed-notebook-engineering");
  });

  it("returns null for unrelated failures", () => {
    expect(uuidErrorValue("TypeError: Failed to fetch")).toBeNull();
    expect(uuidErrorValue("invalid input syntax for type uuid: not quoted")).toBeNull();
  });
});

describe("runSync uuid repair", () => {
  withTestDb();

  beforeEach(() => {
    __resetSyncTrigger();
    setSyncStatus({ phase: "disabled", lastSyncedAt: null, message: null });
    h.reload.mockClear();
    __setReloadHandler(h.reload);
    h.getSession.mockResolvedValue({
      data: { session: { user: { id: "00000000-0000-0000-0000-0000000000aa" } } },
    });
  });

  it("repairs local ids and asks for a reload instead of surfacing the error", async () => {
    const database = db();
    await database.notebooks.put({
      id: "seed-notebook-1",
      parentId: "",
      name: "Seed",
      position: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    h.reconcile.mockRejectedValueOnce(
      new Error('invalid input syntax for type uuid: "seed-notebook-1"'),
    );

    await runSync();

    const status = getSyncStatus();
    expect(status.phase).toBe("syncing");
    expect(status.message).toBe("Repaired local data — reloading to finish.");

    const notebooks = await database.notebooks.toArray();
    expect(notebooks).toHaveLength(1);
    expect(notebooks[0].name).toBe("Seed");
    expect(isUuid(notebooks[0].id)).toBe(true);

    await vi.waitFor(() => expect(h.reload).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it("stays on the error path when there is nothing to repair", async () => {
    h.reconcile.mockRejectedValueOnce(
      new Error('invalid input syntax for type uuid: "seed-note-0"'),
    );

    await runSync();

    const status = getSyncStatus();
    expect(status.phase).toBe("error");
    expect(status.message).toContain("seed-note-0");
    expect(status.message).toContain("can't sync");
    expect(h.reload).not.toHaveBeenCalled();
  });
});
