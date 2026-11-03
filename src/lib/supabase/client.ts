import type { SupabaseClient } from "@supabase/supabase-js";
import { isRemoteEnabled, supabaseConfig, supabaseHost } from "./config";

/**
 * Browser Supabase client.
 *
 * Deliberately *not* `@supabase/ssr`: this app has no server data layer
 * (everything reads IndexedDB, shares go through an anonymous RPC), so there
 * is no cookie session to keep in sync with a server. One client per tab with
 * the default localStorage session is the whole story.
 *
 * Returns `null` when the two public env vars are absent, which is a supported
 * state — the app is local-first and every remote code path is optional.
 *
 * `@supabase/supabase-js` is imported dynamically. It used to be a static
 * import, which put ~105 KB gzip of GoTrue client on every route including
 * local-only builds that can never use it. `import type` is erased, so this
 * module stays tiny and the library is fetched only when a remote call is
 * actually made.
 */

export { isRemoteEnabled, supabaseHost };

let cached: Promise<SupabaseClient | null> | null = null;

export async function getSupabase(): Promise<SupabaseClient | null> {
  if (cached) return cached;

  cached = (async () => {
    const config = supabaseConfig();
    if (!config) return null;

    const { createClient } = await import("@supabase/supabase-js");
    return createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Email confirmation links return with tokens in the URL fragment;
        // the client must parse them on load or the user lands signed out.
        detectSessionInUrl: true,
      },
    });
  })();

  return cached;
}

/** Test seam: forget the cached client after env changes. */
export function __resetSupabaseClient(): void {
  cached = null;
}
