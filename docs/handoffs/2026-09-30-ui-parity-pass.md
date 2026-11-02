# Handoff — UI parity pass

**Date:** 2026-09-30
**Status:** complete — `typecheck`, `test` (342), `lint`, `build` green; all routes 200, clean dev log

## What this was

A UI comparison against a three-pane notes-app screenshot, in five batches, closing
the gaps that are feasible in a local-first, no-backend app. The first pass
wrote off note links and slash commands as "the next increment"; a second audit
of the screenshot showed they are part of the objective, and they are built.

## Closed

**Batch A — outline and title bar**
- `EditorOutline`: headings derived from the live document, nested by level,
  collapsible, click-to-scroll, scroll-spy.
- `TagChips` inline in the title bar. `CountIndicator`. `LockToggle`.
  Fullscreen and outline toggles.

**Batch B — editor toolbar**
- Tables, LaTeX via KaTeX, horizontal rule, image picker, link dialog,
  heading dropdown.

**Batch C — note list and sidebar**
- Sort by last edited / created / title, direction, pinned-first.
- Selection circles always visible. Templates. Sidebar collapses to an icon rail.

**Batch D — note list detail and note links**
- List header names the current scope and its size; rows show tags and link
  counts.
- `[[wiki links]]`, resolved and resolved-later, with a backlinks panel, a link
  picker, and a toolbar button. Schema v3.

**Batch E — slash commands and code language**
- `/` menu over every supported block type, with keyboard navigation.
- Code block language dropdown, round-tripping through Markdown as a fence.

**Batch F — final audit**
- Primary "New note" button with a menu (the sidebar had none).
- Last-edited time in the title bar.
- The rail became an overlay below `xl` rather than hidden.

## Real bugs found

Eight, all fixed:

1. **StarterKit v3 already bundles HorizontalRule.** Added separately →
   `Duplicate extension names found`. Third time this trap has appeared.
2. **`sortNotes` subtracted values for every sort key**, so the title sort
   produced `NaN` and silently did nothing.
3. **`createNote` could not carry derived fields.** A note from a template had a
   body but empty Markdown and text — invisible to search and previews until the
   first autosave.
4. **The wiki-link decoration was off by one character**, covering `[Roof]] `
   instead of `[[Roof]]`. `descendants` reports a text node's position as the
   offset of its first character; the `+1` was wrong. Invisible in a screenshot
   and in every other kind of test.
5. **A note whose own title appeared in its body became its own backlink.** A
   note titled "Roof" saying "see [[Roof]]" is an ordinary thing to write.
6. **`purgeNotes` and `deleteNotebook` did not clean up links** — a referential
   gap introduced with the new table. Both purge both directions now.
7. **Dexie's `transaction()` takes at most six table arguments.** The seventh
   broke `purgeNotes` at runtime with a `SubTransactionError` that `tsc` could
   not catch.
8. **The outline and links toggles were no-ops below 1280px.** The rail was
   `hidden xl:flex`, so the button changed its pressed state and nothing
   appeared.

Plus a false comment in the wiki-link module describing nested-bracket
behaviour the code did not have, and eight React Compiler
`set-state-in-effect` violations fixed by restructuring rather than
suppressing.

Two test-expectation errors of my own, where the code was right and the test was
wrong: `"hdg"` is a legitimate subsequence of "heading", and a text node's
document position is its first-character offset.

## Not built, and why

| From the screenshot | Why |
|---|---|
| AI assistant, sparkle FAB | Needs a model and a backend |
| MCP agent panel | Needs a server |
| Plugins (puzzle icon) | Explicitly out of scope |
| Attachment manager (rail icon) | Only images are supported |
| Mermaid / chart / infographic rendering | Need heavy deps and a backend |
| Table editor in the rail | Tables are in the toolbar, not a global view |
| "Reset Demo Environment" | Demo-only |
| "Download clients" | Web only |
| Syntax highlighting | Would mean swapping StarterKit's code block for the lowlight one — registering both throws. See below. |

These are absent rather than present-and-disabled. A greyed-out control is worse
than no control.

**On syntax highlighting:** the code language selector is real and durable — the
language round-trips through Markdown and reaches a ZIP backup and an HTML
export. It does not colour anything, because highlighting requires replacing
StarterKit's bundled `codeBlock` with `@tiptap/extension-code-block-lowlight`,
and that is a 5.5 MB dependency plus a third encounter with the
duplicate-extension trap, in exchange for colour in a local-first notes app.
Recorded on the component so nobody later reads the dropdown as broken.

## Verification state

**Verified:** typecheck, lint, 342 tests across 24 files, production build, all
routes 200 on a clean `next dev` with no errors in the log.

**Not verified:** there is no browser tool in this environment, so none of this
has been seen rendered. Outline scrolling, table editing, the link dialog, the
math popover, template creation, the slash menu, the backlinks panel, the
collapsed rail and the code language dropdown are covered by unit tests on their
logic — **but nobody has clicked them.**

That is the same gap that let two crashes through in earlier phases, both on
app open. Treat visual behaviour as unproven. In particular the overlay rail
(batch F, bug 8) is a layout change that only a real viewport can confirm.

## Next

The Supabase backend phase remains user-gated
(`docs/plans/frontend-only-m1.md` §13). Nothing else from the screenshot is
outstanding.
