# Changelog

All notable changes to Sidenote are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The hosted demo is intended to be local-first; sync is enabled only when a
  deployment is configured with its own Supabase.
- The maintainer-specific Supabase ops runbook and account scripts were removed
  from the public repository; `docs/SELF-HOSTING.md` is the public guide.

### Added

- A generic self-hosting guide (`docs/SELF-HOSTING.md`) covering local-only,
  Supabase, Vercel, Docker and any Node host.
- `Dockerfile`, `docker-compose.yml` and opt-in Next.js standalone output for
  container deployments.
- The sign-in screen and Settings now name the Supabase host a deployment syncs
  to, so users know where their notes go before signing in.

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
