import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
 */
let cached: SupabaseClient | null = null;

export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isRemoteEnabled(): boolean {
  return supabaseConfig() !== null;
}

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const config = supabaseConfig();
  if (!config) return null;

  cached = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Email confirmation links return with tokens in the URL fragment;
      // the client must parse them on load or the user lands signed out.
      detectSessionInUrl: true,
    },
  });
  return cached;
}
