import type { AuthStatus } from "@/lib/supabase/auth-store";
import type { SyncPhase } from "./status";

export type SyncIconState =
  | "hidden"
  | "signed-out"
  | "offline"
  | "syncing"
  | "saved"
  | "error";

/**
 * Which face the sync control shows. Pure so every branch is testable and the
 * component stays a switch over strings.
 *
 * `loading` is hidden on purpose: showing "offline" or "not syncing" for the
 * half-second before the session resolves is a lie the user can catch.
 */
export function syncIconState(input: {
  remoteEnabled: boolean;
  authStatus: AuthStatus;
  phase: SyncPhase;
  online: boolean;
}): SyncIconState {
  const { remoteEnabled, authStatus, phase, online } = input;

  if (!remoteEnabled || authStatus === "disabled" || authStatus === "loading") return "hidden";
  if (authStatus === "signed-out") return "signed-out";
  if (!online) return "offline";
  if (phase === "syncing") return "syncing";
  if (phase === "error") return "error";
  return "saved";
}
