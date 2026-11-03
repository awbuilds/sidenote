import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestDb } from "@/lib/db/test-helpers";
import { db } from "@/lib/db/db";
import { createNote } from "@/lib/db/repositories/notes";
import { setSetting } from "@/lib/db/repositories/settings";
import { __resetSearchWork, markSearchDirty } from "@/lib/search/dirty";

interface FakeWorker {
  posted: unknown[];
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
  respond(message: unknown): void;
}

const state = vi.hoisted(() => ({ worker: null as FakeWorker | null }));

vi.mock("@/lib/search/worker-client", () => ({
  createSearchWorker: () => {
    const worker: FakeWorker = {
      posted: [],
      onmessage: null,
      postMessage(message) {
        worker.posted.push(message);
      },
      terminate() {},
      respond(message) {
        worker.onmessage?.({ data: message } as MessageEvent);
      },
    };
    state.worker = worker;
    return worker;
  },
}));

const { useSearch } = await import("./useSearch");

withTestDb();

beforeEach(() => {
  __resetSearchWork();
  state.worker = null;
});

function worker(): FakeWorker {
  if (state.worker === null) throw new Error("worker was not created");
  return state.worker;
}

describe("useSearch boot", () => {
  it("restores a persisted index whose dataVersion still matches", async () => {
    await setSetting("dataVersion", 7);
    await db().searchIndex.put({
      key: "current",
      serialized: '{"documentCount":3}',
      dataVersion: 7,
      documentCount: 3,
    });

    const { result } = renderHook(() => useSearch(""));

    await waitFor(() => expect(worker().posted).toHaveLength(1));
    expect(worker().posted[0]).toEqual({
      type: "restore",
      serialized: '{"documentCount":3}',
    });

    act(() => worker().respond({ type: "ready", count: 3, source: "restore" }));
    expect(result.current.isReady).toBe(true);
    expect(result.current.count).toBe(3);
  });

  it("sends only the changed note after a save, not the whole corpus", async () => {
    await setSetting("dataVersion", 1);
    const note = await createNote({ title: "Roof", contentText: "before" });

    renderHook(() => useSearch(""));
    await waitFor(() => {
      expect(
        worker().posted.some((message) => (message as { type: string }).type === "index"),
      ).toBe(true);
    });
    act(() => worker().respond({ type: "ready", count: 1, source: "index" }));

    await db().notes.update(note.id, { contentText: "after" });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => markSearchDirty([note.id]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    vi.useRealTimers();

    const update = worker().posted.find(
      (message) => (message as { type: string }).type === "update",
    ) as { docs: { id: string; text: string }[]; remove: string[] } | undefined;
    expect(update).toBeDefined();
    expect(update!.docs).toHaveLength(1);
    expect(update!.docs[0].id).toBe(note.id);
    expect(update!.docs[0].text).toBe("after");
    expect(worker().posted.filter((message) => (message as { type: string }).type === "index")).toHaveLength(1);
  });

  it("indexes a note created after the worker booted", async () => {
    await setSetting("dataVersion", 1);

    renderHook(() => useSearch(""));
    await waitFor(() => {
      expect(
        worker().posted.some((message) => (message as { type: string }).type === "index"),
      ).toBe(true);
    });
    act(() => worker().respond({ type: "ready", count: 0, source: "index" }));

    // Fake timers must be active before the write schedules the debounce.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const note = await createNote({ title: "Brand new", contentText: "fresh" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    vi.useRealTimers();

    const update = worker().posted.find(
      (message) => (message as { type: string }).type === "update",
    ) as { docs: { id: string }[] } | undefined;
    expect(update).toBeDefined();
    expect(update!.docs.map((doc) => doc.id)).toContain(note.id);
  });

  it("rebuilds from the live notes when the persisted index is stale", async () => {
    await setSetting("dataVersion", 8);
    await db().searchIndex.put({
      key: "current",
      serialized: "{}",
      dataVersion: 7,
      documentCount: 1,
    });
    await createNote({ title: "Roof repair", contentText: "gutter" });

    renderHook(() => useSearch(""));

    await waitFor(() => {
      const index = worker().posted.find(
        (message) => (message as { type: string }).type === "index",
      );
      expect(index).toBeDefined();
    });

    const index = worker().posted.find(
      (message) => (message as { type: string }).type === "index",
    ) as { docs: { title: string }[] };
    expect(index.docs).toHaveLength(1);
    expect(index.docs[0].title).toBe("Roof repair");
  });
});
