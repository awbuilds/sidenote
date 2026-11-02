import { getSupabase } from "./client";

/** User-facing text for the errors GoTrue actually returns. */
function friendly(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Wrong email or password.";
  if (lower.includes("email not confirmed")) return "Confirm your email first — check your inbox.";
  if (lower.includes("already registered")) return "That email already has an account.";
  if (lower.includes("password should be at least")) return "That password is too short.";
  if (lower.includes("unable to validate email")) return "That email address looks invalid.";
  if (lower.includes("rate limit") || lower.includes("too many"))
    return "Too many attempts — wait a minute and try again.";
  return message;
}

export interface AuthActionResult {
  error: string | null;
}

export async function signInWithPassword(email: string, password: string): Promise<AuthActionResult> {
  const client = getSupabase();
  if (!client) return { error: "Remote accounts are not configured in this build." };
  const { error } = await client.auth.signInWithPassword({ email, password });
  return { error: error ? friendly(error.message) : null };
}

/**
 * Where GoTrue should send the browser after a confirmation / recovery link.
 *
 * Must be allow-listed on the stack (`SITE_URL` origin or an entry in
 * `ADDITIONAL_REDIRECT_URLS`), or GoTrue ignores it and falls back to
 * `SITE_URL` — which is exactly how confirmation links ended up on Studio.
 */
export function authRedirectUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/auth`;
}

export interface SignUpResult extends AuthActionResult {
  /** True when the project requires email confirmation before a session exists. */
  needsConfirmation: boolean;
}

export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const client = getSupabase();
  if (!client) return { error: "Remote accounts are not configured in this build.", needsConfirmation: false };
  const redirectTo = authRedirectUrl();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    ...(redirectTo === undefined ? {} : { options: { emailRedirectTo: redirectTo } }),
  });
  return {
    error: error ? friendly(error.message) : null,
    needsConfirmation: Boolean(data.user) && !data.session,
  };
}

export async function signOutRemote(): Promise<void> {
  await getSupabase()?.auth.signOut();
}
