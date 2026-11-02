"use client";

import { Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { snippetFor } from "@/lib/search/engine";
import type { SearchHit } from "@/lib/search/engine";

/**
 * Split a snippet around the matched terms so they can be highlighted.
 * Terms come from MiniSearch already lowercased, so the match is
 * case-insensitive by construction.
 */
export function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;

  const escaped = terms
    .filter((term) => term.length > 1)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (escaped.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) =>
        pattern.test(part) ? (
          <mark key={index} className="rounded-sm bg-amber-200 px-0.5 text-foreground dark:bg-amber-500/40">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function SearchResultRow({
  hit,
  active,
  onSelect,
}: {
  hit: SearchHit;
  active: boolean;
  onSelect: () => void;
}) {
  const snippet = snippetFor(hit);
  const title = hit.title.trim() === "" ? "Untitled note" : hit.title;

  return (
    <Button
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "h-auto w-full flex-col items-start gap-1 px-3 py-2 text-left",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
    >
      <span className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          <HighlightedText text={title} terms={hit.terms} />
        </span>
        <span className="shrink-0 text-[11px] tabular-nums opacity-50">
          {relativeTime(hit.updatedAt)}
        </span>
      </span>
      {snippet !== "" && (
        <span className="line-clamp-2 w-full text-xs font-normal text-muted-foreground">
          <HighlightedText text={snippet} terms={hit.terms} />
        </span>
      )}
    </Button>
  );
}

export function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <SearchIcon className="size-6 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">
        Nothing matches <span className="font-medium text-foreground">“{query}”</span>.
      </p>
      <p className="text-xs text-muted-foreground">
        Search covers note titles and body text.
      </p>
    </div>
  );
}
