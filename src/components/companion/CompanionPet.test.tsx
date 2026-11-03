import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompanionPet } from "./CompanionPet";

describe("CompanionPet", () => {
  it("says a line when petted", async () => {
    const user = userEvent.setup();
    render(<CompanionPet id="fox" />);

    await user.click(screen.getByRole("button", { name: "Pet Pip" }));

    expect(screen.getByRole("status").textContent).toBe("Pip wags a paper tail.");
  });

  it("rotates through its lines", async () => {
    const user = userEvent.setup();
    render(<CompanionPet id="fox" />);
    const pet = screen.getByRole("button", { name: "Pet Pip" });

    await user.click(pet);
    await user.click(pet);

    expect(screen.getByRole("status").textContent).toBe("Pip found a warm paragraph.");
  });
});
