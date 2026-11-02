import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({ rpc }),
}));

import { createShare, fetchSharedNote, shareUrl } from "./api";

describe("share api", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("creates a share through the RPC and trims the password", async () => {
    rpc.mockResolvedValue({
      data: [{ id: "s1", token: "tok", has_password: true, expires_at: null }],
      error: null,
    });

    const result = await createShare("note-1", { password: "  hunter2  " });

    expect(rpc).toHaveBeenCalledWith("create_share", {
      p_note_id: "note-1",
      p_password: "hunter2",
      p_expires_at: null,
    });
    expect(result.share).toEqual({
      id: "s1",
      token: "tok",
      hasPassword: true,
      expiresAt: null,
      createdAt: expect.any(Number),
    });
  });

  it("sends null for a blank password and an ISO expiry", async () => {
    rpc.mockResolvedValue({
      data: [{ id: "s2", token: "tok2", has_password: false, expires_at: null }],
      error: null,
    });

    const expiry = Date.now() + 60_000;
    await createShare("note-1", { password: "   ", expiresAt: expiry });

    expect(rpc).toHaveBeenCalledWith("create_share", {
      p_note_id: "note-1",
      p_password: null,
      p_expires_at: new Date(expiry).toISOString(),
    });
  });

  it("maps an RPC error to a friendly message", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "sign in to create share links" } });
    const result = await createShare("note-1");
    expect(result.error).toBe("Sign in to create share links.");
  });

  it("distinguishes a password prompt from a dead link", async () => {
    rpc
      .mockResolvedValueOnce({ data: [], error: null }) // get_shared_note
      .mockResolvedValueOnce({ data: [{ found: true, requires_password: true }], error: null });

    const prompting = await fetchSharedNote("tok");
    expect(prompting.needsPassword).toBe(true);
    expect(prompting.notFound).toBeUndefined();

    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const dead = await fetchSharedNote("tok");
    expect(dead.notFound).toBe(true);
  });

  it("maps a returned note", async () => {
    const contentJson: JSONContent = { type: "doc", content: [] };
    rpc.mockResolvedValueOnce({
      data: [
        {
          title: "Shared",
          content_json: contentJson,
          content_markdown: "# Shared",
          updated_at: "2026-10-02T12:00:00.000Z",
        },
      ],
      error: null,
    });

    const result = await fetchSharedNote("tok", "pw");

    expect(rpc).toHaveBeenCalledWith("get_shared_note", { p_token: "tok", p_password: "pw" });
    expect(result.note?.title).toBe("Shared");
    expect(result.note?.updatedAt).toBe(Date.parse("2026-10-02T12:00:00.000Z"));
  });

  it("builds an absolute share URL in the browser", () => {
    expect(shareUrl("abc")).toBe(`${window.location.origin}/s/abc`);
  });
});
