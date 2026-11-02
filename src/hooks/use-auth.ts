"use client";

import { useSyncExternalStore } from "react";
import { getAuthSnapshot, subscribeAuth, type AuthSnapshot } from "@/lib/supabase/auth-store";

/** Auth state for components. `disabled` means no Supabase env is configured. */
export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
}
