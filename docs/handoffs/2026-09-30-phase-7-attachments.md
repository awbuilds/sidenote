# Handoff — Phase 7: attachments

**Date:** 2026-09-30
**Status:** complete — `typecheck`, `test` (140), `lint`, `build` green

## What exists now

```
src/lib/attachments/urls.ts        attachment:// refs + ref-counted object URLs
src/lib/attachments/urls.test.ts   9 tests — leak detection
src/lib/tiptap/attachment-image.tsx  Image + node view resolving attachment://
src/lib/image/compress.ts          WebP re-encode, longest edge 2560
src/lib/image/compress.test.ts     13 tests
src/hooks/useAttachmentIngest.ts   paste/drop -> compress -> store -> insert
```

Paste and drag-drop an image into the editor and it is compressed, stored as a
blob, and inserted at the caret.

## The design decision that matters

**The document stores `attachment://<id>`, never a blob URL.**

A blob URL dies with the document that created it. Persisting one would render
a broken image on the next load — a bug that looks like data loss. The
reference is stable; the object URL is resolved at render time by the image
node view and revoked when the last view using it unmounts.

`urls.test.ts` pins this with a counting `URL` stub, including a 25-cycle
acquire/release loop asserting `created.length === revoked.length`. A leak is a
test failure, not something to notice later.

## Compression, honestly

jsdom has no canvas and no `createImageBitmap`, so the real encode path cannot
run in tests. The tests pin the decision logic around it instead:

- which types are eligible (`svg+xml`, PDFs and text are not)
- the downscale maths, including a portrait image and a dimension that would
  round to zero
- **that every failure mode returns the original**, not an exception: no
  `createImageBitmap`, a rejected decode, no 2D context, and WebP that comes
  out bigger than the input

That last group is the important one. A compression bug must never cost the
user their image.

## Quota

`addAttachment` rejects anything over 5 MB, and `guardedWrite` converts
`QuotaExceededError` into a `StorageQuotaError` that the mutation layer turns
into a toast pointing at Settings. A full disk stops the ingest loop rather
than failing the remaining files one by one.

## Extending Image

`AttachmentImage` extends `@tiptap/extension-image` with a `ReactNodeViewRenderer`.
Note this makes the extension module a `.tsx` that pulls in React — fine for
the editor, but the `MarkdownManager` path in `markdown.ts` shares
`buildExtensions`. That is currently fine because the manager never instantiates
node views; if a future change makes it do so, the manager will need a
headless variant. Noted here rather than left to be discovered.

## Not built (deliberately)

- **Non-image attachments.** `insertAttachments` rejects anything not starting
  with `image/` and says so. PDFs, Office documents and audio are a much larger
  surface — preview, download, storage cost — and the 5 MB cap makes them
  marginal anyway. The `attachments` table already carries the fields.
- No attachment strip or delete-a-single-attachment UI.
- `attachmentUrls()` in `urls.ts` is unused; it is the hook a future strip
  would need. It creates un-ref-counted URLs, so **do not use it as-is** —
  it should be deleted or reworked on the ref-counted path first.

## Not verified

**No image has ever been pasted.** The compression decision logic, the URL
lifetime, and the reference format are all tested; the node view rendering a
real blob is not, because that needs a browser.

## Next up

**Phase 8 — export and import.** ZIP backup, ZIP restore, ENEX import. This is
the user's only backup, so its fidelity is the single most important test in the
milestone.
