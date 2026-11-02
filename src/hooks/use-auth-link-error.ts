"use client";

import { useSyncExternalStore } from "react";
import { readAuthLinkError } from "@/lib/supabase/link-error";

const subscribe = () => () => {};
const serverSnapshot = () => null;

/** The one-time "link expired" message behind a confirmation URL, if any. */
export function useAuthLinkError(): string | null {
  return useSyncExternalStore(subscribe, readAuthLinkError, serverSnapshot);
}
