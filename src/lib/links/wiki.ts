/**
 * Wiki links.
 *
 * A link is written `[[Note Title]]` in the document body. It stays plain text
 * in the document rather than becoming a node, which is the whole reason it
 * survives a Markdown round trip, a ZIP backup and an HTML export without
 * needing a resolver on the other end. The `noteLinks` table is a derived
 * index over that text, rebuilt on every save — so it cannot disagree with what
 * the note actually says.
 *
 * Why titles and not ids: ids are unreadable, and a link that survives being
 * written down should survive the note being renamed. An unresolved link keeps
 * its title and resolves later if a note of that name ever appears.
 */

export interface WikiLink {
  /** The target title as written, trimmed. */
  title: string;
  /** Text to display, when the link used `[[title|alias]]`. */
  alias: string | null;
  /** Character offset in the source text. */
  index: number;
}

/**
 * Every `[[...]]` in a body, in order of appearance.
 *
 * The character class excludes inner brackets, so the match is always the
 * *innermost* pair: `[[a [[b]] c]]` yields one link titled `b`, not one titled
 * `a [[b]] c`. Nested wiki links are not something anyone writes deliberately,
 * and an index that cannot contain a bracket is what keeps a stray `]]` in
 * prose from swallowing the rest of the note.
 */
export function extractWikiLinks(text: string): WikiLink[] {
  const found: WikiLink[] = [];
  const pattern = /\[\[([^[\]]+)\]\]/g;

  let match = pattern.exec(text);
  while (match !== null) {
    const inner = match[1];
    const pipe = inner.indexOf("|");
    const title = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim();

    // `[[]]` and `[[|alias]]` name nothing, so they are not links.
    if (title !== "") found.push({ title, alias, index: match.index });
    match = pattern.exec(text);
  }

  return found;
}

/** Distinct titles, in first-appearance order. Case-folded for matching. */
export function linkTitles(text: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const link of extractWikiLinks(text)) {
    const key = link.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(link.title);
  }
  return titles;
}

/** The `[[...]]` form for a title, with the inner brackets escaped away. */
export function wikiLink(title: string): string {
  return `[[${title.replace(/[[\]]/g, "")}]]`;
}

/** What the link reads as in the document. */
export function wikiLinkText(link: WikiLink): string {
  return link.alias ?? link.title;
}

/**
 * How well a body matches a search term, for finding linking notes.
 *
 * Ranked rather than filtered, so the backlink list can lead with the notes
 * that actually mention the title. The title match is weighted above the body
 * match because a note that links to `Roof` is more likely to be relevant than
 * one that merely discusses roofing.
 */
export function backlinkRelevance(body: string, title: string, limit = 5): number {
  if (body.trim() === "") return 0;
  const haystack = body.toLowerCase();
  const needle = title.trim().toLowerCase();
  if (needle === "") return 0;

  let score = 0;
  if (haystack.includes(needle)) score += 10;

  // Whole-word occurrences score higher than a substring inside a word.
  const words = haystack.match(/\w+/g) ?? [];
  const exact = words.filter((word) => word === needle).length;
  score += exact * 4;

  return limit > 0 ? Math.min(score, limit * 10) : score;
}
