import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COMPANION_DIALOG_LINES } from "@/lib/companion";
import { PetDialogContentView } from "./PetDialogContent";

function view(petEnabled = true) {
  const onOpenChange = vi.fn();
  const result = render(
    <Dialog open onOpenChange={onOpenChange}>
      <PetDialogContentView
        mode="share"
        petId="fox"
        petEnabled={petEnabled}
        reducedMotion
      >
        <DialogHeader>
          <DialogTitle>Share this note</DialogTitle>
          <DialogDescription>A public link anyone can open.</DialogDescription>
        </DialogHeader>
        <input aria-label="Password" />
      </PetDialogContentView>
    </Dialog>,
  );
  return { ...result, onOpenChange };
}

describe("PetDialogContentView", () => {
  it("presents the dialog with the pet and its quote", () => {
    view();

    expect(screen.getByRole("dialog", { name: "Share this note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pet Pip" })).toBeTruthy();
    expect(document.querySelector(".pet-stage-quote")?.textContent).toContain(
      COMPANION_DIALOG_LINES.fox.share[0],
    );
  });

  it("cycles the quote when petted", async () => {
    const user = userEvent.setup();
    view();

    await user.click(screen.getByRole("button", { name: "Pet Pip" }));
    expect(document.querySelector(".pet-stage-quote")?.textContent).toContain(
      COMPANION_DIALOG_LINES.fox.share[1],
    );
  });

  it("closes from the card's close button", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = view();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders the standard dialog when the pet is off", () => {
    view(false);

    expect(screen.getByRole("dialog", { name: "Share this note" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pet Pip" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });
});
