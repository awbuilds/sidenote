# 2026-11-02 — Open-source release (0.0.1)

- **Date:** 2026-11-02
- **Agent / task:** Make Sidenote a fresh, public, AGPL-licensed open-source
  project at 0.0.1; remove every third-party reference from the public tree and
  history; protect `main`; publish the GitHub Pages site.
- **Branch / commit:** `main` at `d0938c5` — a single root commit.
- **Status:** DONE, with one manual Vercel step outstanding.

## Current state

- **Repository:** <https://github.com/awbuilds/sidenote> — public, default branch
  `main`. The repository was deleted and recreated for a genuinely clean
  history: **one root commit**, with no third-party references anywhere.
- **Branches:** `main` (working) and `0.0.1` (release branch). **Tags:** only
  `0.0.1`. **Release:** [0.0.1](https://github.com/awbuilds/sidenote/releases/tag/0.0.1).
- **Licence:** GNU AGPL-3.0, copyright Abhijith Warrier. GitHub detects
  `AGPL-3.0`.
- **Protection:** ruleset `protect-main` (id 26386818) — pull request required,
  0 required approvals (self-merge allowed), the `ci` check required, linear
  history, no force-push, no deletions, **no bypass actors**.
- **CI:** `.github/workflows/ci.yml` — `npm ci`, typecheck, test, lint, build on
  every PR and on `main`. **CodeQL** runs on PRs, `main` and weekly.
- **Security:** secret scanning and push protection enabled; Dependabot security
  updates enabled; Actions default token permissions are read-only; production
  dependency audit is **0**.
- **Community health:** GitHub reports **100%** — README, AGPL licence,
  contributing guide, code of conduct, issue/PR templates, security policy.
- **Website:** <https://awbuilds.github.io/sidenote/> — static site in
  `website/`, deployed by `.github/workflows/pages.yml`; the repository homepage
  points at it. Pages was enabled after the first push, so the deployment was
  re-run; verify the URL returns 200.
- **Live app:** <https://sidenoteapp.vercel.app> — **local-only**: no account,
  no upload, no sync backend. Sync is self-host only.
- **Warm Paper redesign:** kept **locally only**, on the `warm-paper-redesign`
  branch; it is not pushed to the new repository. The old repository, branches
  and tags are archived at `~/sidenote-archive/2026-11-02/`
  (`sidenote-full.bundle` and `warm-paper.bundle`).

## What changed

- Removed every third-party reference from the tree and renamed the UI-parity
  handoff to `2026-09-30-ui-parity-pass.md`.
- Deleted and recreated the repository so the public history is one clean
  commit; the old history never entered the new repository.
- Added `CHANGELOG.md`, `.github/CODEOWNERS`, `.github/workflows/codeql.yml`,
  and `.editorconfig`.
- Bumped `package.json` and the lockfile to **0.0.1**; created the `0.0.1`
  branch, annotated tag and GitHub Release.
- Kept the Dependabot version-update configuration, but closed the initial
  upgrade PRs so the branch list is exactly `main` + `0.0.1`. They will be
  re-proposed on the next scheduled run.

## Verification

- `main` has **1** commit; `git grep` for the old reference on `main` returns
  nothing.
- Remote heads: `main`, `0.0.1`. Remote tags: `0.0.1`.
- Release `0.0.1` is published (not draft, not prerelease).
- CI and CodeQL are green on `main`.
- `npm run typecheck`, 465 tests (1 skipped), `npm run lint`, `npm run build`
  all green; `npm audit --omit=dev` reports no vulnerabilities.
- Community profile: 100%.

## Outstanding

Nothing blocking. The private Supabase data cleanup remains a maintainer task:
export any notes worth keeping, then delete non-owner/test accounts (`auth.users`
deletes cascade to profiles, notes, notebooks, tags, attachments, versions and
shares), or delete/pause the project if it was only used for testing.

**Vercel is local-only as of 2026-11-03.** The project
(`prj_xvYACQHMn8t0yplMYoOIWLJEI0DX`) is linked to `awbuilds/sidenote`, deploys
`main` to production, has no `NEXT_PUBLIC_SUPABASE_*` variables, and the live
deployment (`dpl_2H4d1MZZz2opnW5GoDWidzPhTwuq`, commit `61031d7`) was verified in
a browser: `/auth` shows “Remote accounts are not configured in this build” and
Settings shows “This build has no remote configured”.

**Private Supabase ops were removed from the public tree on 2026-11-03.** The
maintainer-specific runbook, promo-account script and smoke script are archived
locally under `~/sidenote-archive/`; `docs/SELF-HOSTING.md` is the public guide.
The repository was deleted and recreated to purge the old commits; the removed
files, private domains, IP and paths are absent from the new history.

## Notes for the next session

- `main` is protected: every change lands through a pull request with a green
  `ci` run.
- `.superpowers/` is gitignored; local brainstorm state is not published.
- The local `warm-paper-redesign` branch is a separate line based on old
  history. Do not push or merge it blindly; porting its layout onto the current
  sync/share shell is a deliberate task.
- Dependabot version-update PRs are **paused** (`open-pull-requests-limit: 0`) so
  the branch list stays `main` + `0.0.1`; security updates remain enabled. Raise
  the limit to re-enable routine upgrades.
- The hosted app is local-only. If a deployment wants sync, it must set its own
  `NEXT_PUBLIC_SUPABASE_*` variables at build time and apply the migrations.
