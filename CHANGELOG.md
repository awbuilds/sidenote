# Changelog

All notable changes to Sidenote are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] — 2026-11-03

### Added

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

### Changed

- The hosted app is local-only: no account, no upload, no sync backend. Sync is
  enabled only when a deployment is configured with its own Supabase.
- The hosted app is no longer described as a demo. Share entry points are hidden
  on deployments without a backend instead of opening a dialog that cannot act.
- The maintainer-specific Supabase ops runbook and account scripts were removed
  from the public repository; `docs/SELF-HOSTING.md` is the public guide.
- “Remove sample data” now deletes only the records created by the seeder. It
  previously cleared every note and notebook, which could destroy user content.

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

[0.0.2]: https://github.com/awbuilds/sidenote/releases/tag/0.0.2
[0.0.1]: https://github.com/awbuilds/sidenote/releases/tag/0.0.1
