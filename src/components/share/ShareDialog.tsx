"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useCreateShare, useRevokeShare, useShares } from "@/hooks/shares";
import { shareUrl } from "@/lib/share/api";
import {
  DEFAULT_SHARE_EXPIRY,
  SHARE_EXPIRY_MAX_DAYS,
  SHARE_EXPIRY_OPTIONS,
} from "@/lib/share/expiry";
import { isRemoteEnabled } from "@/lib/supabase/client";
import { runSync } from "@/lib/sync/trigger";

export function ShareDialog({
  noteId,
  open,
  onOpenChange,
}: {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const auth = useAuth();
  const signedIn = auth.status === "signed-in";
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState<string>(DEFAULT_SHARE_EXPIRY);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: shares = [], isLoading } = useShares(noteId, open && signedIn);
  const create = useCreateShare(noteId);
  const revoke = useRevokeShare(noteId);

  const copy = async (token: string, id: string) => {
    const url = shareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy", { description: url });
    }
  };

  const trimmedPassword = password.trim();
  const passwordTooShort = trimmedPassword !== "" && trimmedPassword.length < 8;

  const handleCreate = async () => {
    if (passwordTooShort) return;
    setCreating(true);
    try {
      // The share row references the note server-side; make sure it exists
      // there before the insert, or the foreign key rejects the link.
      await runSync();
      // Bounded by construction: the choices stop at 30 days, and the RPC
      // clamps anything null or longer, so there is no "never" to fall back to.
      const duration =
        SHARE_EXPIRY_OPTIONS.find((entry) => entry.value === expiry)?.durationMs ??
        SHARE_EXPIRY_OPTIONS.find((entry) => entry.value === DEFAULT_SHARE_EXPIRY)?.durationMs ??
        SHARE_EXPIRY_MAX_DAYS * 24 * 60 * 60 * 1000;
      const result = await create.mutateAsync({
        password: trimmedPassword === "" ? undefined : trimmedPassword,
        expiresAt: Date.now() + duration,
      });
      if (result.error) {
        toast.error(result.error);
      } else if (result.share) {
        setPassword("");
        toast.success("Share link created", {
          description: "Anyone with the link can read this note.",
        });
        await copy(result.share.token, result.share.id);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this note</DialogTitle>
          <DialogDescription>
            A public link anyone can open. Revoke it any time. Images are not
            included in links yet.
          </DialogDescription>
        </DialogHeader>

        {!isRemoteEnabled() ? (
          <p className="text-sm text-muted-foreground">
            Sharing needs a sync backend, and this build has none configured.
          </p>
        ) : !signedIn ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sign in to create read-only links to your notes.
            </p>
            <Button asChild className="w-full">
              <Link href="/auth">Sign in</Link>
            </Button>
          </div>
        ) : (
          // `min-w-0` lets this grid item shrink below the nowrap URL's
          // min-content, which otherwise widens the dialog's implicit column
          // and pushes every row past the right edge. Once it can shrink, the
          // row's `truncate` does its job.
          <div className="min-w-0 space-y-5">
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="share-password">Password (optional)</Label>
                <Input
                  id="share-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="No password"
                  autoComplete="new-password"
                  aria-invalid={passwordTooShort}
                  aria-describedby={passwordTooShort ? "share-password-hint" : undefined}
                />
                {passwordTooShort && (
                  <p id="share-password-hint" className="text-[11px] text-destructive">
                    Use at least 8 characters.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Expiry</Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHARE_EXPIRY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => void handleCreate()}
              disabled={creating || passwordTooShort}
            >
              {creating && <Loader2 className="size-4 animate-spin" />}
              Create link
            </Button>

            {!isLoading && shares.length > 0 && (
              <ul className="space-y-2">
                {shares.map((share) => (
                  <li key={share.id} className="flex items-center gap-2 rounded-md border p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs">{shareUrl(share.token)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {share.hasPassword ? "Password protected · " : ""}
                        {share.expiresAt === null
                          ? "No expiry"
                          : `Expires ${new Date(share.expiresAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Copy link"
                      onClick={() => void copy(share.token, share.id)}
                    >
                      {copiedId === share.id ? (
                        <Check className="size-4 text-emerald-600" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      aria-label="Revoke link"
                      onClick={() =>
                        revoke.mutate(share.id, {
                          onSuccess: (result) =>
                            result.error
                              ? toast.error(result.error)
                              : toast.success("Link revoked"),
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {!isLoading && shares.length === 0 && (
              <p className="text-xs text-muted-foreground">No active links for this note.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
