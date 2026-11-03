import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { useAutosave } from "./useAutosave";
import {
  __resetPendingSaves,
  peekPendingSave,
} from "@/lib/editor/pending-saves";

const DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
};

function payload() {
  return { title: "A note", doc: DOC };
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetPendingSaves();
});

afterEach(() => {
  vi.useRealTimers();
  __resetPendingSaves();
});

describe("useAutosave", () => {
  it("saves once after the debounce, not per keystroke", async () => {
    const writer = { mutateAsync: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useAutosave("note-1", writer));

    act(() => result.current.queue(payload()));
    act(() => result.current.queue({ ...payload(), title: "A note!" }));

    expect(writer.mutateAsync).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(writer.mutateAsync).toHaveBeenCalledTimes(1);
    expect(writer.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "note-1",
        patch: expect.objectContaining({ title: "A note!", contentText: "hello" }),
      }),
    );
    expect(result.current.status).toBe("saved");
    expect(peekPendingSave("note-1")).toBeUndefined();
  });

  it("keeps the payload when the save fails, and retries it on demand", async () => {
    const writer = {
      mutateAsync: vi.fn().mockRejectedValueOnce(new Error("disk full")),
    };
    const { result } = renderHook(() => useAutosave("note-1", writer));

    act(() => result.current.queue(payload()));
    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(result.current.status).toBe("error");
    expect(peekPendingSave("note-1")).toEqual(payload());

    writer.mutateAsync.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.flush();
    });

    expect(writer.mutateAsync).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
    expect(peekPendingSave("note-1")).toBeUndefined();
  });

  it("flushes a queued edit when the editor unmounts", async () => {
    const writer = { mutateAsync: vi.fn().mockResolvedValue(undefined) };
    const { result, unmount } = renderHook(() => useAutosave("note-1", writer));

    act(() => result.current.queue(payload()));
    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(writer.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("retries a payload stranded by a failed save on the next mount", async () => {
    const failing = {
      // Every attempt fails, including the flush triggered by the unmount, so
      // the payload is still stranded when the next mount happens.
      mutateAsync: vi.fn().mockRejectedValue(new Error("aborted")),
    };
    const first = renderHook(() => useAutosave("note-1", failing));

    act(() => first.result.current.queue(payload()));
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    first.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(peekPendingSave("note-1")).toEqual(payload());

    const recovering = { mutateAsync: vi.fn().mockResolvedValue(undefined) };
    renderHook(() => useAutosave("note-1", recovering));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(recovering.mutateAsync).toHaveBeenCalledTimes(1);
    expect(peekPendingSave("note-1")).toBeUndefined();
  });
});
