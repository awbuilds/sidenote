# 0.0.2 — onboarding, companion, theme packs

- **Date:** 2026-11-03
- **Branch:** `0.0.2` (local only; not pushed)
- **Feature branches:** `0.0.2-onboarding`, `0.0.2-companion`, `0.0.2-themes`
- **Status:** implemented and verified locally; awaiting approval to push

## What changed

### First-run tour

Three full-screen pages, mounted only while `settings.onboardingPending` is
true. The seeder sets that flag for a fresh database; restoring samples later
does not reopen the tour.

1. **Welcome** — local-first promise, offline, no account, self-hosted sync.
2. **Starter notes** — a live preview of the seeded notes. The user can keep
   them or start blank. Deletion is explicit, confirmed inline, and available
   only on a first run; a replay hides it.
3. **Make it yours** — theme gallery, companion picker and toggle, install
   action, and **Start writing**.

Finishing or skipping writes `onboardingCompletedAt` and clears the pending
flag. Settings → Appearance → **Show again** replays the tour with deletion
disabled.

### Safe sample deletion

The seeder now records the ids it created in `settings.sampleData`. “Remove
sample data” deletes only those notes, notebooks, tags and attachments, and
keeps any notebook that contains user notes or a user-created child notebook.
Databases seeded before this manifest get a conservative title-based manifest.
`restoreSampleData` remains a full, explicit content wipe and does not reopen
the tour.

### Companion

Four original SVG pets (`fox`, `cat`, `owl`, `moss`) with a settings picker.
The selected pet replaces the sidebar profile icon. When enabled it crosses the
screen once per session, plus after the tour completes, and respects
`prefers-reduced-motion`. It is fixed-position and `pointer-events: none`, so it
cannot widen the page or block a click.

### Theme packs

`theme` remains `light | dark | system`; a new `themePack` setting adds
`paper | blue | glass | gel`. Every pack defines the full token set, a system
font stack, radii and scoped control skins in `src/app/themes.css`:

- **Warm Paper** — the existing default.
- **Blue 2001** — square edges, Tahoma, beveled gradient buttons.
- **Glass 2009** — translucent panels, soft blue glow, rounded controls.
- **Gel 2000** — pinstriped canvas, glossy pill buttons, Lucida stack.

The pre-paint script applies `data-theme-pack` from a localStorage mirror, so
there is no flash. The Settings gallery previews each pack inside a nested
`data-theme-preview` element using its real tokens. `sonner` now reads the app
theme provider instead of the unused `next-themes` one.

## Verification

- `npm run typecheck`, `npm run test` (482 passed, 1 skipped), `npm run lint`,
  `npm run build` all green on `0.0.2`.
- Browser flows (Maestro, Chromium):
  - fresh `localhost` origin → three-page tour → workspace
  - keep samples → workspace keeps six notes
  - start blank → only sample rows removed → empty workspace → reload does not
    reopen the tour
  - Settings → Show again → replay mode hides deletion
  - Blue 2001, Gel 2000 and Glass 2009 applied, persisted in IndexedDB and
    localStorage, survived reload
  - companion on/off and reduced-motion paths checked in the settings UI
- The `.next/dev` log was read after each pass; stale conflict and JSX errors
  from intermediate edits were cleared by a restart.

## Not done

- Nothing has been pushed. `main` and `0.0.1` are untouched.
- No tag or GitHub release for 0.0.2 yet. `package.json` is bumped to 0.0.2.
- Vercel will not see any of this until `0.0.2` is pushed and deployed.
