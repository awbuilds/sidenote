"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { getNote } from "@/lib/db/repositories/notes";
import { buildStandaloneHtml } from "@/lib/transfer/export-note";

/**
 * Print / PDF view for one note.
 *
 * The renderer already existed for the standalone HTML export: inlined CSS,
 * images as data URIs, a `@media print` rule. It was only reachable through
 * "download a file, open it, print it". Rendering it in an iframe keeps that
 * document out of the app's own tree (the string is a full HTML document) and
 * lets the browser's print dialog produce the PDF.
 */
export function PrintView({ noteId }: { noteId: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const note = await getNote(noteId);
        if (cancelled) return;
        if (note === undefined) {
          setError("This note no longer exists.");
          return;
        }
        const result = await buildStandaloneHtml(note);
        if (!cancelled) setHtml(result.html);
      } catch {
        if (!cancelled) setError("Could not prepare this note for printing.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  // Give the iframe a moment to lay out the embedded images before opening the
  // dialog; printing an unloaded document produces blank pages.
  useEffect(() => {
    if (html === null) return;
    const id = setTimeout(() => frame.current?.contentWindow?.print(), 400);
    return () => clearTimeout(id);
  }, [html]);

  if (error !== null) {
    return <p className="p-8 text-sm text-muted-foreground">{error}</p>;
  }

  if (html === null) {
    return <p className="p-8 text-sm text-muted-foreground">Preparing…</p>;
  }

  return (
    <div className="relative h-dvh">
      <button
        type="button"
        onClick={() => frame.current?.contentWindow?.print()}
        className="fixed right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium shadow-sm print:hidden"
      >
        <Printer className="size-3.5" />
        Print
      </button>
      <iframe
        ref={frame}
        srcDoc={html}
        title="Print preview"
        className="h-full w-full border-0"
      />
    </div>
  );
}
