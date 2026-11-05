"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getSupabase } from "@/lib/supabase/client";
import { isRemoteEnabled } from "@/lib/supabase/config";
import { QUERY_KEYS } from "./query-keys";

/**
 * Bytes of synced attachments for this user. PostgREST does the sum server
 * side (RLS scopes it); a soft-deleted row does not count against the quota.
 */
export function useRemoteAttachmentUsage() {
  const auth = useAuth();

  return useQuery({
    queryKey: QUERY_KEYS.attachmentUsage(auth.userId),
    enabled: isRemoteEnabled() && auth.status === "signed-in",
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const client = await getSupabase();
      if (!client || auth.userId === null) return 0;

      const { data, error } = await client
        .from("attachments")
        .select("size_bytes.sum()")
        .eq("user_id", auth.userId)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);

      const row = (data ?? [])[0] as
        | { sum?: number | null; "size_bytes.sum"?: number | null }
        | undefined;
      return Number(row?.sum ?? row?.["size_bytes.sum"] ?? 0);
    },
  });
}
