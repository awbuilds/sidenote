import MiniSearch from "minisearch";
import type { NoteId } from "@/lib/db/types";

/** One note, as the index sees it. */
export interface SearchDoc {
  id: NoteId;
  title: string;
  text: string;
  updatedAt: number;
}

export interface SearchHit {
  id: NoteId;
  title: string;
  text: string;
  score: number;
  /** Terms that actually matched, for highlighting. */
  terms: string[];
  updatedAt: number;
}

export const SEARCH_INDEX_OPTIONS = {
  fields: ["title", "text"] as string[],
  storeFields: ["title", "text", "updatedAt"] as string[],
  searchOptions: {
    // Prefix matching is what makes search feel responsive: typing "proj"
    // should find "project" before the word is finished.
    prefix: true,
    fuzzy: 0.2,
    boost: { title: 3 },
  },
};

export function createIndex(): MiniSearch<SearchDoc> {
  return new MiniSearch<SearchDoc>(SEARCH_INDEX_OPTIONS);
}

export function buildDocs(
  notes: { id: string; title: string; contentText: string; updatedAt: number }[],
): SearchDoc[] {
  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    text: note.contentText,
    updatedAt: note.updatedAt,
  }));
}

export function toHits(results: unknown[]): SearchHit[] {
  return results.map((raw) => {
    const result = raw as {
      id: string;
      score: number;
      terms: string[];
      title: string;
      text: string;
      updatedAt: number;
    };
    return {
      id: result.id,
      title: result.title,
      text: result.text,
      score: result.score,
      terms: result.terms ?? [],
      updatedAt: result.updatedAt,
    };
  });
}

export function search(index: MiniSearch<SearchDoc>, query: string, limit = 50): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  return toHits(index.search(trimmed)).slice(0, limit);
}

/** A short window of body text around the first matching term. */
export function snippetFor(hit: SearchHit, length = 160): string {
  if (hit.terms.length === 0) return hit.text.slice(0, length);

  const lower = hit.text.toLowerCase();
  let at = -1;
  for (const candidate of hit.terms) {
    const index = lower.indexOf(candidate.toLowerCase());
    if (index !== -1 && (at === -1 || index < at)) {
      at = index;
    }
  }
  if (at === -1) return hit.text.slice(0, length);

  const start = Math.max(0, at - Math.floor(length / 3));
  const end = Math.min(hit.text.length, start + length);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < hit.text.length ? "…" : "";
  return `${prefix}${hit.text.slice(start, end).trim()}${suffix}`;
}
