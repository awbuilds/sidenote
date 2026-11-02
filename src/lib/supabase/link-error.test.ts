import { describe, expect, it } from "vitest";
import { parseAuthLinkError } from "./link-error";

describe("parseAuthLinkError", () => {
  it("extracts and decodes GoTrue's description", () => {
    const hash =
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=";
    expect(parseAuthLinkError(hash)).toBe("Email link is invalid or has expired");
  });

  it("falls back to the error code when there is no description", () => {
    expect(parseAuthLinkError("#error=access_denied")).toBe("access_denied");
  });

  it("ignores a successful session fragment", () => {
    expect(parseAuthLinkError("#access_token=abc&refresh_token=def&type=signup")).toBeNull();
  });

  it("handles an empty or broken hash", () => {
    expect(parseAuthLinkError("")).toBeNull();
    expect(parseAuthLinkError("#")).toBeNull();
  });
});
