import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COMPANION_DIALOG_HINTS, COMPANION_DIALOG_LINES } from "@/lib/companion";
import { PetAlertDialogView } from "./PetAlertDialog";

function view(overrides: Partial<Parameters<typeof PetAlertDialogView>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  const props = {
    open: true,
    onOpenChange,
    title: "Empty the trash?",
    description: "This cannot be undone.",
    confirmLabel: "Delete permanently",
    onConfirm,
    petId: "fox" as const,
    petEnabled: true,
    reducedMotion: true,
    ...overrides,
  };
  const result = render(<PetAlertDialogView {...props} />);
  return { ...result, onOpenChange, onConfirm };
}

describe("PetAlertDialogView", () => {
  it("presents the title, description and options", () => {
    view();

    const dialog = screen.getByRole("alertdialog", { name: "Empty the trash?" });
    expect(dialog).toBeTruthy();
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete permanently" })).toBeTruthy();
  });

  it("starts focus on Cancel", async () => {
    view();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

  it("pets the companion and cycles its line", async () => {
    const user = userEvent.setup();
    view();
    const quote = () => document.querySelector(".pet-stage-quote")?.textContent ?? "";

    // Cancel receives initial focus, so the pet starts with the safe hint.
    expect(quote()).toContain(COMPANION_DIALOG_HINTS.cancel);
    await user.click(screen.getByRole("button", { name: "Pet Pip" }));
    expect(quote()).toContain(COMPANION_DIALOG_LINES.fox.danger[1]);
  });

  it("shows the consequence while Confirm is hovered", async () => {
    const user = userEvent.setup();
    view();
    const quote = () => document.querySelector(".pet-stage-quote")?.textContent ?? "";

    await user.hover(screen.getByRole("button", { name: "Delete permanently" }));
    expect(quote()).toContain(COMPANION_DIALOG_HINTS.danger);

    fireEvent.pointerLeave(screen.getByRole("button", { name: "Delete permanently" }));
    expect(quote()).toContain(COMPANION_DIALOG_LINES.fox.danger[0]);
  });

  it("confirms immediately under reduced motion", async () => {
    const user = userEvent.setup();
    const { onConfirm, onOpenChange } = view();

    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancels without confirming", async () => {
    const user = userEvent.setup();
    const { onConfirm, onOpenChange } = view();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = view();

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("falls back to the standard alert dialog when the pet is off", async () => {
    const user = userEvent.setup();
    const { onConfirm } = view({ petEnabled: false });

    expect(screen.queryByRole("button", { name: "Pet Pip" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
