import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

/**
 * Slash commands.
 *
 * Typing `/` opens a menu of block types, filtered by what follows. The trigger
 * is matched against the live document rather than being a stored node, so it
 * never reaches the saved text: when a command runs the `/query` is deleted,
 * and if the menu is dismissed the characters are left as ordinary prose.
 *
 * A `/` that is not at the start of a block does nothing. Slashes inside words
 * are common in prose — "and/or", "50/50", "w/o" — and hijacking them would be
 * hostile.
 *
 * Positions come from ProseMirror's own `resolve` rather than a hand-rolled
 * walk over the document. Re-deriving them is where off-by-one bugs live, and
 * an off-by-one here deletes the wrong character when a command runs.
 */

export interface SlashMatch {
  /** Document position of the `/`. */
  from: number;
  /** Document position just after the query, for deletion. */
  to: number;
  /** What was typed after the `/`. */
  query: string;
}

/** Longest query considered, so a runaway keystroke cannot scan forever. */
const MAX_QUERY = 24;

/**
 * The slash query in a block, given the text before the cursor.
 *
 * Pure, so the matching rules can be tested without an editor. `offset` is how
 * far into `before` the cursor sits.
 */
export function slashQueryInText(before: string): Omit<SlashMatch, "from" | "to"> | null {
  const slash = before.lastIndexOf("/");
  if (slash === -1) return null;

  const query = before.slice(slash + 1);

  // A space ends the command: "/two words" is prose, not a search.
  if (/\s/.test(query)) return null;

  // The `/` must open the block, or follow only whitespace. Anything else is a
  // slash inside a line of text.
  if (before.slice(0, slash).trim() !== "") return null;

  if (query.length > MAX_QUERY) return null;

  return { query };
}

/** Text of the textblock containing `cursor`, and the cursor's offset in it. */
function textblockAt(state: EditorState, cursor: number): { node: ProseMirrorNode; offset: number } | null {
  if (cursor <= 0 || cursor > state.doc.content.size) return null;

  const $pos = state.doc.resolve(cursor);
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;

  return { node: parent, offset: $pos.parentOffset };
}

/**
 * The slash query at the cursor, or null.
 *
 * `cursor` is the position after the last typed character. The trigger must end
 * exactly there — a `/` earlier in the block with the cursor elsewhere is not a
 * command.
 */
export function slashMatchAt(state: EditorState, cursor: number): SlashMatch | null {
  const block = textblockAt(state, cursor);
  if (block === null) return null;

  const before = block.node.textBetween(0, block.offset, undefined, "￼");
  const matched = slashQueryInText(before);
  if (matched === null) return null;

  // `blockStart` is where this textblock's content begins in the document.
  const blockStart = cursor - block.offset;
  return {
    from: blockStart + before.lastIndexOf("/"),
    to: cursor,
    query: matched.query,
  };
}

/** A command, and the text that selects it. */
export interface SlashCommand {
  id: string;
  title: string;
  /** Extra words that also select this command. */
  keywords: string[];
  hint: string;
}

/**
 * Filter commands by query.
 *
 * Subsequence matching, so "hdg" finds "Heading" — the same affordance as a
 * command palette, and the reason nobody has to learn exact names. An empty
 * query returns everything in declaration order.
 */
export function filterCommands<T extends SlashCommand>(commands: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return commands;

  return commands.filter((command: T) => {
    const haystack = `${command.title} ${command.keywords.join(" ")}`.toLowerCase();
    if (haystack.includes(needle)) return true;

    let index = 0;
    for (const char of needle) {
      index = haystack.indexOf(char, index);
      if (index === -1) return false;
      index += 1;
    }
    return true;
  });
}
