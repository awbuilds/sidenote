# 2026-11-02 — Open-source release

- **Date:** 2026-11-02
- **Agent / task:** Make Sidenote a public, AGPL-licensed open-source project,
  protect `main`, and publish a GitHub Pages site.
- **Branch / commit:** `main` (PRs #11 and #19 merged)
- **Status:** DONE, with one manual Vercel step outstanding.

## Current state

- **Repository:** <https://github.com/awbuilds/sidenote> — public, default
  branch `main`. Transferred from `abhijithwrrr/sidenote`; history and branches
  moved with it.
- **Licence:** GNU AGPL-3.0, copyright Abhijith Warrier.
- **Protection:** ruleset `protect-main` on `main` — pull request required,
  0 required approvals (self-merge allowed), the `ci` check required, linear
  history, no force-push, no deletions, **no bypass actors**.
- **CI:** `.github/workflows/ci.yml` runs `npm ci`, typecheck, test, lint, build
  on every PR and on `main`.
- **Security:** Next 16.4.4 (the critical advisory in 16.3.7), TipTap 3.32.2,
  happy-dom 21; the `shadcn` CLI moved to devDependencies.
  `npm audit --omit=dev` is **0**.
- **Website:** <https://awbuilds.github.io/sidenote/> — static site in
  `website/`, deployed by `.github/workflows/pages.yml`. The repository homepage
  points at it.
- **Live app:** <https://sidenoteapp.vercel.app>.
- **Warm Paper redesign:** preserved on the `warm-paper-redesign` branch
  (`dc72ae8`), deliberately **not merged**. `main` already carries the Warm
  Paper palette; the branch carries the older source-list/layout experiment.

## What changed

- Added `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  issue/PR templates, Dependabot, and the AGPL source link in Settings → About.
- Corrected the docs that had drifted: the README no longer claims the app is
  serverless (sync and share links are optional features), and `AGENTS.md` no
  longer lists the nonexistent `/print/[noteId]` route or recommends the
  `next/script` form that React 19 rejects.
- Added the static site and privacy policy, with copy that matches the optional
  self-hosted Supabase model.
- Fixed the outline test that relied on h4 parsing while the schema is h1–h3.

## Verification

- CI passed on PR #11 and PR #19; the Pages deploy succeeded.
- `https://awbuilds.github.io/sidenote/`, `styles.css`, `privacy.html`, and the
  icon all return 200.
- Ruleset verified through the API: `protected: true`, `bypass_actors: []`,
  required check `ci`, 0 approvals.
- `npm run typecheck`, 465 tests (1 skipped), `npm run lint`, `npm run build`
  all green; production dependency audit clean.

## Outstanding

**Vercel still deploys the old `0.1.1` branch.** The live app at
`sidenoteapp.vercel.app` currently shows the pre-open-source UI (Geist, star
splash). Set the project's **Production Branch to `main`** and reconnect the Git
integration to `awbuilds/sidenote`. This is the one step that needs the Vercel
dashboard; no token or CLI is available in this environment.

## Notes for the next session

- `.superpowers/` is gitignored; local brainstorm state is not published.
- The `warm-paper-redesign` branch is a separate line based on an ancestor of
  `main`. Do not merge it blindly: porting its layout onto the current sync/share
  shell is a deliberate task, not a stash pop.
- `main` is protected. Any follow-up lands through a PR with a green `ci` run.
