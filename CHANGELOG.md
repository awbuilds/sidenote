# Changelog

All notable changes to Sidenote are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.0.2 — 2026-11-03

### Fixed

- **Version history is history again.** Snapshots are taken on the first edit,
  on a rename, and at most every five minutes — not on every 800 ms autosave,
  which filled the list with the last few minutes of typing. A sync pull that
  moved a note's counter backwards can no longer collide with the history
  index and make every later save fail. Conflict detection compares canonical
  JSON, so a pull that changed nothing is not reported as a conflict.
- **Tag edits are visible immediately.** The `tags` query family was never
  invalidated, and with `staleTime: Infinity` that meant chips, sidebar counts
  and the tag manager stayed stale until a reload.
- Restoring a note whose notebook was deleted puts it back in Unfiled instead
  of leaving it reachable only from an all-notes view.
- Reordering notebooks now propagates the new sibling positions to other
  devices.
- An autosave that fails while switching notes is retried when the note is
  reopened, instead of being lost with the unmounted editor.
- An attachment that would exceed the 50 MB budget no longer aborts the whole
  sync pass or re-uploads on every tick. The rest of the pass completes and
  the status popover says which file stayed on the device.
- Share links can no longer be created for another user's note, and the
  security-definer reader refuses a share whose note owner differs. The
  attachment quota now applies to updates as well as inserts.
- Share password hashes are no longer sent to the browser, and new share
  passwords must be at least eight characters.

### Changed

- Autosave re-indexes only the note that changed. The note list, title
  resolver, sidebar counts, trash badge and command palette read compound
  indexes instead of loading every note body.
- `@supabase/supabase-js` is imported only when a remote call is made, removing
  roughly 105 KB gzip from every local-only page.
- `shadcn` is a runtime dependency because `globals.css` imports its
  stylesheet; `npm ci --omit=dev` builds now resolve it.
- Response hardening: `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`, and a report-only CSP in production.
- Settings → About shows the app version and, on Vercel, the commit.
- Settings → Backup says when the last export was and how many writes have
  landed since.
- The hosted app is local-only: no account, no upload, no sync backend. Sync is
  enabled only when a deployment is configured with its own Supabase.
- The hosted app is no longer described as a demo. Share entry points are hidden
  on deployments without a backend instead of opening a dialog that cannot act.
- The maintainer-specific Supabase ops runbook and account scripts were removed
  from the public repository; `docs/SELF-HOSTING.md` is the public guide.
- “Remove sample data” now deletes only the records created by the seeder. It
  previously cleared every note and notebook, which could destroy user content.

### Added

- **Print / PDF** for a note at `/print/[noteId]`, reusing the standalone HTML
  renderer (inlined styles, embedded images, print rules).
- **Named versions** — "Save a version" keeps a labelled checkpoint that age
  never prunes.
- A pgTAP suite for RLS, share ownership and the attachment quota, with a
  path-filtered CI job, and a `npm run test:db` script.
- A docs privacy check in CI, so host paths and deployment ids cannot return.
- A three-page first-run tour: local-first explanation, a live preview of the
  sample notes with a keep-or-delete choice, and theme/companion setup. Only a
  fresh database sees it; Settings → Appearance can replay it.
- Four theme packs — Warm Paper, Blue 2001, Glass 2009 and Gel 2000 — each with
  light and dark variants, plus a theme gallery with live three-pane previews.
- Four original companion pets, with a picker, a sidebar avatar, and an optional
  once-per-session run that honours `prefers-reduced-motion`. The pet is
  interactive: click it to make it hop and say a line.
- A third-party notices file covering dependencies, fonts, icons and original
  artwork, linked from the README, the website and Settings → About.
- A `NOTICE` file recording the project copyright and AGPL-3.0-only license.
- A generic self-hosting guide (`docs/SELF-HOSTING.md`) covering local-only,
  Supabase, Vercel, Docker and any Node host.
- `Dockerfile`, `docker-compose.yml` and opt-in Next.js standalone output for
  container deployments.
- The sign-in screen and Settings name the Supabase host a deployment syncs to,
  so users know where their notes go before signing in.

### Website

- Rebuilt the project site around the app's warm-paper palette: a serif
  editorial hero, a browser-framed screenshot, a feature grid, a privacy
  diagram, a self-host terminal, an FAQ, and a full footer. It follows the
  system light/dark preference and uses no web fonts or scripts.
- Added the complete policy set: privacy, terms of use, cookies, security,
  accessibility and a legal notice, each with an effective date, a table of
  contents and print styles.
- Added a custom 404, `robots.txt`, `sitemap.xml`,
  `/.well-known/security.txt` and a `.nojekyll` marker.
- Linked the policies from the app's Settings → About, the auth page, the
  public share viewer and the README.

### Removed

- The internal ops note and the superseded design-system snapshot.
- Unused `clsx` and `tailwind-merge` direct dependencies.

## [0.0.1] — 2026-11-02

First public release.

### Added

- **Local-first storage** — notebooks, notes, tags, attachments, versions and
  settings in IndexedDB via Dexie. Works offline and needs no account.
- **Three-pane workspace** — nested notebooks with drag-to-reparent and cycle
  detection, a searchable/sortable note list with pinning, and a TipTap editor.
- **Editor** — raw Markdown view over the same document, tables, LaTeX, images
  (WebP, longest edge 2560px), task lists, templates, slash commands, and
  per-block code languages.
- **Knowledge tools** — `[[wiki links]]` with a backlinks panel, an outline with
  scroll-spy, and MiniSearch in a Web Worker with a persisted index.
- **Optional self-hosted sync** — Supabase auth, last-write-wins sync for
  notebooks/notes/tags/note-tags, attachment byte sync with a 50 MB budget, and
  public share links with optional password, expiry and revocation.
- **Backup and transfer** — ZIP export/import, Markdown and standalone HTML
  export, and Evernote ENEX import.
- **PWA** — installable app-shell service worker, focus mode (⌘⇧F) and a command
  palette (⌘K).
- **Open source** — GNU AGPL-3.0, CI, CodeQL, Dependabot, issue and pull-request
  templates, contribution and security guides, and a GitHub Pages site.

### Security

- Next.js 16.4.4, TipTap 3.32.2 and happy-dom 21; the `shadcn` CLI is a
  development dependency. `npm audit --omit=dev` reports no vulnerabilities.

[0.0.1]: https://github.com/awbuilds/sidenote/releases/tag/0.0.1
[0.0.2]: https://github.com/awbuilds/sidenote/releases/tag/0.0.2
