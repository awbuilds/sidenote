"use client";

import { useState } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useAllShares, useRevokeAnyShare } from "@/hooks/shares";
import { shareUrl } from "@/lib/share/api";

/** Settings view of every active share link, across notes. */
export function SharesSection() {
  const auth = useAuth();
  const { data: shares } = useAllShares();
  const revoke = useRevokeAnyShare();
  const [copied, setCopied] = useState<string | null>(null);

  if (auth.status !== "signed-in") return null;

  return (
    <section className="mt-4 space-y-3 rounded-lg border p-4">
      <h2 className="text-sm font-medium">Shared links</h2>
      {shares === undefined || shares.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active links. Share a note from the editor toolbar to create one.
        </p>
      ) : (
        <ul className="space-y-2">
          {shares.map((share) => (
            <li key={share.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{share.noteTitle.trim() || "Untitled note"}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {shareUrl(share.token)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Copy link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl(share.token));
                    setCopied(share.id);
                    toast.success("Link copied");
                  } catch {
                    toast.error("Could not copy");
                  }
                }}
              >
                {copied === share.id ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-destructive"
                aria-label="Revoke link"
                onClick={() =>
                  revoke.mutate(share.id, {
                    onSuccess: (result) =>
                      result.error ? toast.error(result.error) : toast.success("Link revoked"),
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
