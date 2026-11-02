# Handoff — UI phases: sync status, mobile shell, onboarding, list, typography, account

**Date:** 2026-10-02
**Branch:** `0.1.1` (working tree — **not committed**, per instruction)
**Status:** implemented; `typecheck`, 448 tests, `lint`, `build` clean; dev-server log 0
errors. Visual/signed-in verification still pending on localhost.

## 1. Sync UX (Drive-style)

- `src/lib/sync/trigger.ts` — interval 30 s (`SYNC_INTERVAL_MS`), exponential
  backoff on failure (30 s → 300 s, ±10 % jitter), `pollSync()` for ticks and
  `runSyncNow()` for the explicit button (clears the wait). Local writes still
  push after a ~1.2 s debounce.
- `src/lib/sync/icon-state.ts` (+ tests) — pure state mapping:
  hidden / signed-out / offline / syncing / saved / error.
- `src/components/sync/SyncStatusButton.tsx` — icon + popover (state, last
  synced, account, Sync now, settings link). Placed in the sidebar header,
  the mobile pane headers, and the collapsed icon rail (replacing the old
  account dot).
- "Sync now" in settings now uses `runSyncNow()`.

## 2. Mobile shell

- `MobileTabBar` — Notes · Notebooks · Search · Trash, safe-area padded,
  hidden on `lg` and while the editor pane is open. The workspace is now a
  flex column so the bar takes layout space instead of overlaying panes.
- Long-press selection (`useLongPress`) on note rows; the round checkboxes are
  hidden until selection mode or hover, so touch no longer shows a checkbox
  wall. The click that follows a fired long-press is swallowed.
- `preview()` now takes an optional title and drops a first line that merely
  repeats it ("Welcome" under "Welcome to your notes") — note rows and the
  command palette both pass the title.
- Command palette open state moved to `src/lib/ui-store.ts` so the Search tab
  can open it.

## 3. Onboarding

- `GettingStartedCard` in the sidebar: install (standalone detection +
  browser prompt), optional sign-in, first backup; dismissible for good.
- `lastBackupAt` is written when a ZIP export succeeds.
- Empty note lists now offer "Create a note"; the trash page's warning is
  account-aware (`trashWarning`).

## 4. Note list & organization

- Date groups when sorting by last edit: Pinned / Today / Yesterday /
  Previous 7 days / Earlier (`src/lib/note-groups.ts` + tests); other sorts
  stay flat.
- Density toggle (`listDensity`, comfortable/compact) in the sort menu;
  compact hides previews.
- Tag colors are real now: dots in the sidebar, colored chips in rows, and a
  `TagManagerDialog` (rename / recolor / delete) opened from the Tags header;
  `updateTagColor` added to the tags repository and mutation hooks.

## 5. Typography

- New settings: `editorFont` (sans/serif/mono), `editorWidth`
  (narrow/medium/wide = 60/72/84ch), `editorLineHeight`.
- Applied to the editor's centered column via `editorTypographyClass`
  (+ tests); three selects added to Settings → Appearance.

## 6. Account & storage details

- Synced-attachment meter in the Sync card: PostgREST aggregate
  (`size_bytes.sum()`, RLS-scoped) against the 50 MB budget
  (`useRemoteAttachmentUsage`).
- `SharesSection` in settings: every active link with copy/revoke
  (`listAllShares` embeds the note title).
- Storage panel warns only when nearly full (≥90 %).

## New settings keys (client-only, no Dexie migration)

`onboardingDismissed`, `lastBackupAt`, `listDensity`, `editorFont`,
`editorWidth`, `editorLineHeight`.

## Deliberate simplifications

- The Search tab opens the command palette rather than a separate search
  surface.
- Share links have no view counts (needs a schema change).
- Sync backoff is client-only; there is still no Realtime push.

## Verify

1. `npm run dev`, open `localhost:3000` (the OpenChamber panel could not reach
   this machine's localhost, so this pass was log/route-checked only).
2. Signed out: sidebar shows the CloudOff sync button + getting-started card.
3. Sign in: icon cycles syncing → saved; popover shows Sync now; settings
   shows attachment meter and shared links.
4. Mobile width: bottom tabs appear outside the editor; long-press a note row
   to enter selection.
5. Settings → Appearance: font/width/line-height change the editor column live.
