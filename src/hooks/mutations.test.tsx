import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Note } from "@/lib/db/types";

const mocks = vi.hoisted(() => ({
  setNoteTags: vi.fn(),
  saveNoteContent: vi.fn(),
}));

vi.mock("@/lib/db/repositories/tags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/repositories/tags")>();
  return { ...actual, setNoteTags: mocks.setNoteTags };
});

vi.mock("@/lib/db/repositories/notes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/repositories/notes")>();
  return { ...actual, saveNoteContent: mocks.saveNoteContent };
});

const { useSaveNoteContent, useSetNoteTags } = await import("./mutations");

function note(): Note {
  return {
    id: "note-1",
    notebookId: null,
    title: "T",
    contentJson: { type: "doc", content: [{ type: "paragraph" }] },
    contentMarkdown: "",
    contentText: "T",
    isPinned: false,
    isTrashed: false,
    trashedAt: null,
    version: 2,
    createdAt: 1,
    updatedAt: 2,
  };
}

function withClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, wrapper };
}

beforeEach(() => {
  mocks.setNoteTags.mockReset().mockResolvedValue([]);
  mocks.saveNoteContent.mockReset().mockResolvedValue(note());
});

describe("mutation invalidation", () => {
  it("invalidates the tags family after a tag edit, which used to go stale forever", async () => {
    const { invalidate, wrapper } = withClient();
    const { result } = renderHook(() => useSetNoteTags(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ noteId: "note-1", names: ["roof"] });
    });

    const families = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(families).toContainEqual(["tags"]);
    expect(families).toContainEqual(["note"]);
  });

  it("does not refetch every note or settings on an autosave", async () => {
    const { client, invalidate, wrapper } = withClient();
    client.setQueryData(["notes", null, false], [note()]);
    // The same family also holds a numeric count; the patcher must not assume
    // every matching query is a list.
    client.setQueryData(["notes", "trash-count"], 3);
    const setQueries = vi.spyOn(client, "setQueriesData");
    const { result } = renderHook(() => useSaveNoteContent(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: "note-1",
        patch: {
          title: "T",
          contentJson: note().contentJson,
          contentMarkdown: "",
          contentText: "T",
        },
      });
    });

    const families = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(families).toEqual([["links"]]);
    expect(families).not.toContainEqual(["settings"]);
    expect(setQueries).toHaveBeenCalled();
    expect(client.getQueryData(["note", "note-1"])).toMatchObject({ id: "note-1" });
    expect(client.getQueryData(["notes", "trash-count"])).toBe(3);
  });
});
