import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./client";

/**
 * Tiny external store around Supabase auth.
 *
 * `useSyncExternalStore` needs a cached snapshot object, so derive one and
 * replace it only when something actually changed. The subscription starts
 * lazily on first subscriber; nothing network-touching happens at module load.
 */
export type AuthStatus = "disabled" | "loading" | "signed-in" | "signed-out";

export interface AuthSnapshot {
  status: AuthStatus;
  email: string | null;
  userId: string | null;
}

let snapshot: AuthSnapshot = { status: "loading", email: null, userId: null };
let started = false;
const listeners = new Set<() => void>();

function replace(next: AuthSnapshot): void {
  if (
    next.status === snapshot.status &&
    next.email === snapshot.email &&
    next.userId === snapshot.userId
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function applySession(session: Session | null): void {
  if (!session) {
    replace({ status: "signed-out", email: null, userId: null });
    return;
  }
  replace({ status: "signed-in", email: session.user.email ?? null, userId: session.user.id });
}

function start(): void {
  if (started) return;
  started = true;

  const client = getSupabase();
  if (!client) {
    replace({ status: "disabled", email: null, userId: null });
    return;
  }

  void client.auth.getSession().then(({ data }) => applySession(data.session));
  client.auth.onAuthStateChange((_event, session) => applySession(session));
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}
