# Handoff — Phase 9: share export

**Date:** 2026-09-30
**Status:** complete — `typecheck`, `test` (178), `lint`, `build` green

## What exists now

`src/lib/transfer/export-note.ts` is the real thing now, not a stub:

- `buildStandaloneHtml(note)` returns `{ html, missing }`
- `exportNoteAsHtml(note)` downloads it
- `shareNote(note)` uses the OS share sheet via `navigator.share` when the
  browser supports file sharing, and falls back to a download
- Wired into the note menu as "Share…"

`export-note.test.ts` — 10 tests.

## What makes the HTML actually shareable

A file that links to a stylesheet or a `blob:` URL is not shareable. So:

- styles are inlined, with a `prefers-color-scheme` block so it reads in dark
  mode, and a `@media print` block
- every `attachment://<id>` image is resolved to a **`data:` base64 URI** at
  build time
- a missing attachment is replaced with a visible `[missing image]` marker and
  reported in `missing`, rather than a broken image icon

The tests assert the negative too: no `<link rel=stylesheet>`, no
`src="http`, and no surviving `attachment://` in the output.

## The stale-object trap, hit again

Four tests failed at first with the exported body rendering as `<p></p>`.

`buildStandaloneHtml(note)` was being handed the object from `createNote`, whose
`contentJson` is an empty document. `saveNoteContent` returns the updated note;
the tests were ignoring the return value and reusing the snapshot.

This is the third time this pattern has cost time (once in the notebook tests,
now twice here). `AGENTS.md` said "never *assert on* the object a mutating call
returned" — too narrow. It now says never *use* it, with the count of how often
it has bitten.

## Honest limits

- **There is no public link.** A note in this browser has no URL anyone else can
  open. "Share" means handing over a file. The toast says so.
- **Size.** Base64 grows images ~33%, so a note with many photos produces a
  large file. Documented on `shareNote`.
- `navigator.canShare({ files })` is checked before use, so a browser without
  file sharing degrades to a download rather than throwing.

## Next up

**Phase 10 — PWA**: manifest, service worker for the app shell, an install
path, and a first-class `storage.persist()` request. Then **Phase 11** — final
test pass, polish, and the Vercel deploy.
