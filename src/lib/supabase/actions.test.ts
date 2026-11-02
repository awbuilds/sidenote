import { beforeEach, describe, expect, it, vi } from "vitest";

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }));

vi.mock("./client", () => ({
  getSupabase: () => ({ auth: { signUp } }),
}));

import { authRedirectUrl, signUpWithPassword } from "./actions";

describe("auth actions", () => {
  beforeEach(() => {
    signUp.mockReset();
  });

  it("builds the redirect from the app origin, not the API origin", () => {
    expect(authRedirectUrl()).toBe(`${window.location.origin}/auth`);
  });

  it("asks GoTrue to return the browser to the app after confirmation", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });

    const result = await signUpWithPassword("a@b.c", "secret1");

    expect(signUp).toHaveBeenCalledWith({
      email: "a@b.c",
      password: "secret1",
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    expect(result.needsConfirmation).toBe(true);
    expect(result.error).toBeNull();
  });
});
