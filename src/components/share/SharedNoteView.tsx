"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchSharedNote } from "@/lib/share/api";
import { renderSharedHtml } from "@/lib/share/render";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl px-6 py-10">{children}</div>;
}

export function SharedNoteView({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  // `null` = not tried yet; a string = last submitted password, so a wrong
  // one can be told apart from "this share needs a password".
  const [attempted, setAttempted] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["shared-note", token, attempted],
    queryFn: () => fetchSharedNote(token, attempted),
    retry: false,
  });

  const data = query.data;
  const html = useMemo(
    () => (data?.note ? renderSharedHtml(data.note.contentJson) : ""),
    [data],
  );

  if (query.isLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      </Shell>
    );
  }

  if (query.isError || data?.notFound) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">This link is not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have expired, been revoked, or never existed.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-6">
          <Link href="/">Go to Sidenote</Link>
        </Button>
        <Brand className="mt-10" />
      </Shell>
    );
  }

  if (data?.needsPassword) {
    return (
      <Shell>
        <div className="flex items-center gap-2">
          <Lock className="size-4" />
          <h1 className="text-lg font-semibold">This note is password protected</h1>
        </div>
        <form
          className="mt-4 flex max-w-sm gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(password);
          }}
        >
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            aria-label="Password"
          />
          <Button type="submit">Open</Button>
        </form>
        {attempted !== null && (
          <p className="mt-3 text-sm text-destructive">That password is not right.</p>
        )}
        <Brand className="mt-10" />
      </Shell>
    );
  }

  const note = data?.note;
  return (
    <Shell>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared note</p>
      <h1 className="mt-1 text-2xl font-semibold">{note?.title.trim() || "Untitled"}</h1>
      <article className="note-prose mt-6" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/">Try Sidenote</Link>
        </Button>
        <Brand />
      </div>
    </Shell>
  );
}
