/**
 * Supabase configuration, with no dependency on `@supabase/supabase-js`.
 *
 * Every component that only needs "is a backend configured?" imports from
 * here. Keeping the client library out of this module is what lets the
 * library be loaded lazily: `client.ts` imports it dynamically, so a
 * local-only deployment never downloads it.
 */

export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isRemoteEnabled(): boolean {
  return supabaseConfig() !== null;
}

/**
 * Host of the configured Supabase instance, for honest sign-in copy.
 *
 * The URL is public (the anon key is too), so showing it tells the user which
 * server their notes will reach before they sign in.
 */
export function supabaseHost(): string | null {
  const config = supabaseConfig();
  if (!config) return null;
  try {
    return new URL(config.url).host;
  } catch {
    return config.url;
  }
}
