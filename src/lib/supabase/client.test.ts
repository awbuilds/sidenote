import { afterEach, describe, expect, it } from "vitest";
import { supabaseHost } from "./client";

const saved = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

function restore(): void {
  if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;

  if (saved.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
}

afterEach(restore);

describe("supabaseHost", () => {
  it("is null when the deployment has no backend", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(supabaseHost()).toBeNull();
  });

  it("returns the host, not the full URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://notes.example.com/path";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
    expect(supabaseHost()).toBe("notes.example.com");
  });

  it("falls back to the raw value when the URL is malformed", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not a url";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
    expect(supabaseHost()).toBe("not a url");
  });
});
