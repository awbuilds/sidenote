"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Providers } from "@/components/providers";
import { Brand } from "@/components/Brand";
import { useAuth } from "@/hooks/use-auth";
import { useAuthLinkError } from "@/hooks/use-auth-link-error";
import { signInWithPassword, signUpWithPassword } from "@/lib/supabase/actions";
import { supabaseHost } from "@/lib/supabase/client";

function AuthView() {
  const router = useRouter();
  const auth = useAuth();
  const linkError = useAuthLinkError();
  const host = supabaseHost();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === "signed-in") router.replace("/notes");
  }, [auth.status, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "sign-in") {
      const result = await signInWithPassword(email.trim(), password);
      if (result.error) setError(result.error);
      else router.replace("/notes");
    } else {
      const result = await signUpWithPassword(email.trim(), password);
      if (result.error) setError(result.error);
      else if (result.needsConfirmation)
        setNotice("Account created. Check your inbox to confirm your email, then sign in.");
      else router.replace("/notes");
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <Button variant="ghost" size="sm" className="mb-6 -ml-2 self-start gap-2" asChild>
        <Link href="/notes">
          <ArrowLeft className="size-4" />
          Back to notes
        </Link>
      </Button>

      <h1 className="text-lg font-semibold">Sync across devices</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        An account is optional. Your notes keep working offline in this browser
        whether or not you sign in.
      </p>
      {host !== null && (
        <p className="mt-2 text-xs text-muted-foreground">
          This deployment syncs to <span className="font-mono">{host}</span>. Sign
          in only if you trust that server.
        </p>
      )}

      {linkError !== null && auth.status !== "signed-in" && (
        <p className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          That link could not be used: {linkError}. Sign in below, or create the
          account again to get a fresh email.
        </p>
      )}

      {auth.status === "disabled" ? (
        <div className="mt-6 space-y-2 rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            Remote accounts are not configured in this build.
          </p>
          <p className="text-xs text-muted-foreground">
            This demo is local-only.{" "}
            <a
              href="https://github.com/awbuilds/sidenote/blob/main/docs/SELF-HOSTING.md"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Self-host with your own Supabase
            </a>{" "}
            to enable accounts and sync.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Tabs value={mode} onValueChange={(value) => setMode(value as "sign-in" | "sign-up")}>
            <TabsList className="w-full">
              <TabsTrigger value="sign-in" className="flex-1">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="sign-up" className="flex-1">
                Create account
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </form>
      )}

      <Brand className="mt-10 text-center" />
    </div>
  );
}

export default function AuthPage() {
  return (
    <Providers>
      <main className="min-h-dvh">
        <AuthView />
      </main>
    </Providers>
  );
}
