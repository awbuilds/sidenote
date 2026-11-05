import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/queries", () => ({
  useNotebookTree: () => ({ data: [], isPending: false }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateNotebook: () => ({ mutate: vi.fn(), isPending: false }),
  useRenameNotebook: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteNotebook: () => ({ mutate: vi.fn(), isPending: false }),
  useMoveNotebook: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderNotebooks: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { NotebookTree } from "./NotebookTree";

describe("NotebookTree empty state", () => {
  it("opens the create dialog from the empty-state button", async () => {
    const user = userEvent.setup();
    render(<NotebookTree selectedId={null} onSelect={() => {}} />);

    await user.click(screen.getByRole("button", { name: "New notebook" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Name")).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDefined();
  });
});
