# Handoff — Phase 5: editor

**Date:** 2026-09-30
**Status:** complete — `typecheck`, `test` (105), `lint`, `build` green; editor verified via a real TipTap instance in jsdom

## What exists now

```
src/lib/tiptap/
  extensions.ts   the one extension set (StarterKit + TaskList/TaskItem/Image/Placeholder/Markdown)
  markdown.ts     MarkdownManager wrapper: toMarkdown / fromMarkdown
  doc.ts          docToText + isEmptyDoc, dependency-free
  markdown.test.ts  19 tests — round-trip fidelity
  editor.test.ts    11 tests — a real Editor in jsdom
src/components/editor/
  NoteEditor.tsx      TipTap + autosave + save indicator
  EditorToolbar.tsx   bold/italic/strike/code, h1-h3, 3 list types, quote, undo/redo
  MarkdownSource.tsx  raw Markdown edit surface
  VersionHistory.tsx  snapshot list + restore
src/components/notes/TagPicker.tsx
src/lib/transfer/export-note.ts   Markdown + standalone HTML export
```

`EditorPane` now owns the real editor with three tabs: Editor / Markdown /
History, plus tag picking, pin, and per-note export.

## TipTap v3 findings

- **StarterKit already bundles Link and Underline.** Adding
  `@tiptap/extension-link` separately would register a duplicate and throw.
  Configure through `StarterKit.configure({ link: {...} })` instead.
  `@tiptap/extension-link` is still in package.json from earlier — safe to
  remove, nothing imports it.
- **`@tiptap/markdown` is first-party** (backed by `marked`). `MarkdownManager`
  can be constructed standalone, so the round trip is testable without a DOM.
  Serialising a malformed doc throws; `toMarkdown` catches and returns `""`
  rather than losing the JSON, which is authoritative.
- The editor exports `editor.getMarkdown()` and accepts
  `setContent(md, { contentType: 'markdown' })`, but going through our own
  manager keeps the Markdown view and autosave on one code path.

## Round-trip fidelity — the honest version

`markdown.test.ts` asserts **idempotence after first normalisation**: for each
of 9 constructs, `serialize(parse(md))` is stable. That is the property that
matters — the stored document is the JSON, and the Markdown view must not drift
each time it is opened.

What is **not** claimed: byte-identical round trip. The first normalisation
changes some formatting (list markers, emphasis style, heading spacing). Any
node type outside the extension set is dropped. If a construct is ever added to
`buildExtensions`, add a case to `samples` in `markdown.test.ts`.

## `docToText` bug caught by a test

Joining a paragraph's children with `" "` produced `"Some  bold  and  italic ."`
— double spaces and a space before the full stop — because those children are
contiguous runs from one sentence, not separate words. Now joined with `""`.
This also mattered for search quality and note previews, not just tests.

It now lives in `src/lib/tiptap/doc.ts` with no runtime imports, so the seed can
use it without dragging the editor into the first-load bundle. The seed's
`builders.ts` re-exports it — there is exactly one implementation.

## React Compiler lint, again

Three more restructurings rather than suppressions:

- `NoteEditor` assigns refs **in an effect**, never during render
  (`latest.current = ...` mid-render is rejected).
- The note-change reset effect is gone entirely: `EditorPane` passes
  `key={note.id}`, so switching notes remounts and there is nothing to reset.
- `MarkdownSource` no longer mirrors the document in state and syncs it with an
  effect. It seeds from the document on mount and is keyed by
  `` `${note.id}:markdown` ``, so the textarea cannot stomp on text mid-typing.

## Autosave

Debounced 800 ms, with a flush on `visibilitychange` and `pagehide`, and on
unmount (the note-switch path). A failed save keeps the payload and offers
Retry rather than dropping the edit. Status is `saving` / `saved` / `error` with
`aria-live`. The plan promised no keystroke lost; this is the mechanism.

## Not verified

**The editor has never been seen by a browser.** `editor.test.ts` proves the
schema, every toolbar command, and the round trip in jsdom, and `/notes`
returns 200 — but nobody has typed into it, pasted an image, or toggled the
Markdown tab. Treat the editing UX as unverified.

## Not built

- Attachments (Phase 7) — the Image extension is registered but nothing writes
  an attachment yet.
- `useUpdateSettings` exists but no settings form uses it.
- Bulk restore in trash, tag filtering in the sidebar.

## Next up

**Phase 6 — tags and search.** Tag sidebar and filtering, then the MiniSearch
index in a Web Worker. `dataVersion` already bumps on every content write, which
is what the index will key off for invalidation.
