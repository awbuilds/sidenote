# Handoff — Phase 8: export and import

**Date:** 2026-09-30
**Status:** complete — `typecheck`, `test` (168), `lint`, `build` green; all routes 200 in `next dev`

## What exists now

```
src/lib/transfer/
  zip-export.ts      exportAll(), manifest, readable Markdown + front matter
  zip-import.ts      importFromArchive(), markdown-only fallback
  enex.ts            ENEX parser (pure, heavily tested)
  enex.test.ts       13 tests
  zip.test.ts        15 tests — round trip into a fresh database
  import-actions.ts  importEnex(), htmlToMarkdown()
  export-note.ts     single note: Markdown + standalone HTML
src/components/settings/BackupSection.tsx
```

Settings now has real backup, restore, Evernote import, profile name and a
delete-everything danger zone.

## The archive has two layers, deliberately

- **`data.json`** — lossless. Exact ids, `contentJson`, version history, trash
  state, tag links, attachment metadata. This is what a restore uses.
- **`notes/*.md`** — readable Markdown with front matter and relative
  attachment links. This survives the app existing.

A backup with only the Markdown would silently drop version history and
attachments. One with only `data.json` would be useless to a human. Trashed
notes are included: a backup that drops the trash is not a backup.

## Storage change: attachments are now `Uint8Array`, not `Blob`

`fake-indexeddb`'s structured clone degrades a `Blob` to a plain object,
stripping `arrayBuffer()`. A `structuredClone` override on the fake factory
did **not** fix it — the degradation happens on read regardless.

That left a choice: keep `Blob` and accept that **the backup path is
untestable**, or store bytes. Since the ZIP is the only copy of this data
outside the browser, having its round trip unverified was not acceptable. At a
5 MB cap the memory advantage of `Blob` is not worth it.

Consequence: `addAttachment` still takes a `Blob` (callers hold `File`s) and
stores `Uint8Array`. `attachmentBlob()` converts back where an object URL is
needed. This was a real, load-bearing change — the reason is recorded on the
`Attachment.data` field so nobody "simplifies" it back.

## Three real bugs the tests caught

1. **Restore could not find attachment metadata.** It looked up the original
   row in the *current* database, which is empty on a fresh restore, so every
   attachment was skipped with a warning. Fixed by carrying attachment
   metadata (and its archive path) in `data.json`.
2. **`data.json` was serialised before the attachment loop ran**, capturing an
   empty attachment list. Moved after.
3. **Note titles never reached the readable Markdown** — they existed only in
   `data.json`, so `notes/*.md` had no title at all. Added to front matter.

Plus: JSZip lists the `notes/` directory itself as an entry, so a naive
`startsWith("notes/")` count returns n+1. Tests filter on `.md` and `!dir`.

## ENEX

`parseEnexDate` handles the `20250115T093000Z` format. The parser accepts both
`content-enclosed` (the real ENEX field, full note) and a bare `content`
(some exporters emit only the snippet); both cases are tested, and
`content-enclosed` wins when present.

`htmlToMarkdown` uses the browser's own `DOMParser` rather than adding an
HTML-to-ProseMirror dependency. **This makes Evernote import lossy** for
anything not in `BLOCK_TAGS`/the switch — that is stated in the UI, which
labels the import "a one-way migration" and tells the user to check the result.

## The round-trip test restores into a *second, empty database*

Asserting on the export's own shape proves nothing. The test deletes the
source database, creates a fresh one, imports, and compares nesting, tag
links, trash state, content structure and attachment byte length. It is also
asserted idempotent — importing twice is stable.

## Verified

`/notes`, `/settings`, `/trash` all 200 with a clean dev log. This phase found
a **crash on opening any note** (`TabsContent` outside its `Tabs`) that no gate
caught — the dev-log check earned its place.

## Not verified

No ZIP has been downloaded and re-imported through the actual browser UI. The
archive logic is covered; `downloadBlob` and the file inputs are not.

## Next up

**Phase 9 — share file export** (self-contained HTML, already partly built in
`export-note.ts`) and then **Phase 10 — PWA**.
