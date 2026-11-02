# 2026-11-02 — Open-source release (0.0.1)

- **Date:** 2026-11-02
- **Agent / task:** Make Sidenote a fresh, public, AGPL-licensed open-source
  project at 0.0.1; remove every the reference reference from the public tree and
  history; protect `main`; publish the GitHub Pages site.
- **Branch / commit:** `main` at `d0938c5` — a single root commit.
- **Status:** DONE, with one manual Vercel step outstanding.

## Current state

- **Repository:** <https://github.com/awbuilds/sidenote> — public, default branch
  `main`. The repository was deleted and recreated for a genuinely clean
  history: **one commit**, no the reference anywhere.
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
- **Live app:** <https://sidenoteapp.vercel.app>.
- **Warm Paper redesign:** kept **locally only**, on the `warm-paper-redesign`
  branch; it is not pushed to the new repository. The old repository, branches
  and tags are archived at `~/sidenote-archive/2026-11-02/`
  (`sidenote-full.bundle` and `warm-paper.bundle`).

## What changed

- Removed every the reference reference from the tree and renamed
  `docs/handoffs/2026-09-30-ui-parity-reference.md` to
  `2026-09-30-ui-parity-pass.md`.
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

- `main` has **1** commit; `git grep -i reference` on `main` returns nothing.
- Remote heads: `main`, `0.0.1`. Remote tags: `0.0.1`.
- Release `0.0.1` is published (not draft, not prerelease).
- CI and CodeQL are green on `main`.
- `npm run typecheck`, 465 tests (1 skipped), `npm run lint`, `npm run build`
  all green; `npm audit --omit=dev` reports no vulnerabilities.
- Community profile: 100%.

## Outstanding

**Vercel still deploys the old `0.1.1` branch.** The live app at
`sidenoteapp.vercel.app` needs the project's **Production Branch set to `main`**
and its Git integration reconnected to `awbuilds/sidenote`. This is the one step
that needs the Vercel dashboard; no token or CLI is available in this
environment.

## Notes for the next session

- `main` is protected: every change lands through a pull request with a green
  `ci` run.
- `.superpowers/` is gitignored; local brainstorm state is not published.
- The local `warm-paper-redesign` branch is a separate line based on old
  history. Do not push or merge it blindly; porting its layout onto the current
  sync/share shell is a deliberate task.
- Dependabot version updates will return on their weekly schedule. Review them;
  the initial batch was closed only to keep the 0.0.1 reset clean.
