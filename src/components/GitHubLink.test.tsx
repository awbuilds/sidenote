import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GitHubLink, SOURCE_CODE_URL } from "./GitHubLink";

describe("GitHubLink", () => {
  it("links to the public source repository", () => {
    render(<GitHubLink />);
    const link = screen.getByRole("link", { name: "Source code on GitHub" });
    expect(link).toHaveAttribute("href", SOURCE_CODE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
