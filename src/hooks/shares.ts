"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createShare, listAllShares, listShares, revokeShare } from "@/lib/share/api";
import { useAuth } from "@/hooks/use-auth";
import { isRemoteEnabled } from "@/lib/supabase/client";
import { QUERY_FAMILIES, QUERY_KEYS } from "./query-keys";

export function useShares(noteId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.shares(noteId),
    queryFn: () => listShares(noteId as string),
    enabled: enabled && noteId !== null && isRemoteEnabled(),
    retry: false,
  });
}

export function useCreateShare(noteId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { password?: string; expiresAt?: number | null }) =>
      createShare(noteId, input),
    onSuccess: (result) => {
      if (result.share) void client.invalidateQueries({ queryKey: QUERY_KEYS.shares(noteId) });
    },
  });
}

export function useRevokeShare(noteId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeShare(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: QUERY_KEYS.shares(noteId) }),
  });
}

/** All of the user's active links, for the settings manager. */
export function useAllShares() {
  const auth = useAuth();
  return useQuery({
    queryKey: QUERY_KEYS.allShares,
    queryFn: listAllShares,
    enabled: isRemoteEnabled() && auth.status === "signed-in",
    retry: false,
  });
}

export function useRevokeAnyShare() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeShare(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: QUERY_FAMILIES.shares }),
  });
}
