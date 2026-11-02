"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorState } from "@tiptap/pm/state";

/**
 * Renders `[[Note Title]]` as a link without changing the document.
 *
 * A decoration, not a node, and that choice is load-bearing:
 *
 *  - The text stays exactly as written, so the Markdown view, a ZIP backup and
 *    an HTML export all carry the link with no resolver on the other end.
 *  - Editing `Roof` to `Roofing` is ordinary typing. A node would need its own
 *    paste, delete and input rules to avoid fighting the user.
 *  - A link to a note that does not exist still renders, marked as unresolved,
 *    instead of vanishing or being rejected by the schema.
 *
 * The cost is that it is not a real anchor, so it cannot be middle-clicked or
 * copied out of the DOM. For a local-first app that is the right trade.
 *
 * The resolver is installed as a command rather than passed as an option,
 * because the set of note titles changes while the editor is alive. Owning it
 * here means the component never has to hand a live value into render.
 */

export type WikiLinkResolver = (title: string) => boolean;

/**
 * Every note title, lowercased.
 *
 * Module state rather than a prop or a context value, because the extension
 * needs it while it is building decorations — inside ProseMirror — where
 * reading React state is neither possible nor correct. The editor is only
 * constructed once this has been populated (see the `NoteEditor` wrapper), so
 * a link is never briefly mis-styled as unresolved.
 */
const knownTitles = new Set<string>();

export function setKnownTitles(titles: string[]): void {
  knownTitles.clear();
  for (const title of titles) {
    const key = title.trim().toLowerCase();
    // First wins a duplicate title, so the decoration and the link index in the
    // database always agree on which note a link means.
    if (key !== "" && !knownTitles.has(key)) knownTitles.add(key);
  }
}

export function isKnownTitle(title: string): boolean {
  return knownTitles.has(title.trim().toLowerCase());
}

export interface WikiLinkOptions {
  /** Used until `setWikiLinkResolver` says otherwise. */
  resolved: WikiLinkResolver;
}

interface WikiLinkStorage {
  resolver: WikiLinkResolver;
}

declare module "@tiptap/core" {
  interface Storage {
    /** The installed resolver, owned by the extension rather than the caller. */
    wikiLink: WikiLinkStorage;
  }
}

const KEY = new PluginKey("wikiLink");

/**
 * Decorations for every `[[...]]` in the document.
 *
 * Each text node is scanned with a freshly created regex — a shared one carries
 * `lastIndex` between nodes and silently skips matches.
 */
function build(state: EditorState, isResolved: WikiLinkResolver): Decoration[] {
  const decorations: Decoration[] = [];
  const pattern = /\[\[([^[\]]+)\]\]/g;

  state.doc.descendants((node, pos) => {
    // `text` is typed `string | undefined`; a null check alone will not narrow.
    if (!node.isText || node.text == null) return true;

    const text: string = node.text;
    let match = pattern.exec(text);

    while (match !== null) {
      const inner = match[1] ?? "";
      const title = (inner.includes("|") ? inner.slice(0, inner.indexOf("|")) : inner).trim();

      if (title !== "") {
        // `descendants` reports a text node's position as the offset of its
        // first character, so `pos` is already the start of the text — adding
        // one here shifted every link a character to the right.
        const from = pos + match.index;
        decorations.push(
          Decoration.inline(from, from + match[0]!.length, {
            class: isResolved(title) ? "wiki-link" : "wiki-link wiki-link-unresolved",
            "data-wiki-title": title,
          }),
        );
      }
      match = pattern.exec(text);
    }

    return true;
  });

  return decorations;
}

export const WikiLink = Extension.create<WikiLinkOptions, WikiLinkStorage>({
  name: "wikiLink",

  addOptions() {
    return { resolved: isKnownTitle };
  },

  addStorage() {
    return { resolver: this.options.resolved };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    return [
      new Plugin({
        key: KEY,
        state: {
          init: (_config, state) =>
            DecorationSet.create(state.doc, build(state, storage.resolver)),
          apply: (tr, value, _old, state) => {
            // Rebuilt on every document change so a link edited, or a title
            // changed and then typed near, re-resolves without any explicit
            // refresh transaction.
            if (tr.docChanged) {
              return DecorationSet.create(state.doc, build(state, storage.resolver));
            }
            return value.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return KEY.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});

/** The title on the wiki link under a click, if the click landed on one. */
export function wikiLinkTitleFrom(target: EventTarget | null): string | null {
  const element = (target as HTMLElement | null)?.closest?.("[data-wiki-title]");
  const title = element?.getAttribute("data-wiki-title");
  return title === undefined || title === null || title === "" ? null : title;
}
