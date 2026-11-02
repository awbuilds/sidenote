# Handoff — Backend Phase 2: optional accounts + sync

**Date:** 2026-10-02
**Branch:** `0.1.1`
**Status:** auth and one-way-to-two-way LWW sync implemented and green.
Public share links, attachment sync and deployment are still open.

## What was built

**Remote layer (`src/lib/supabase/`)**

- `client.ts` — browser `supabase-js` client, lazily created. Returns `null`
  when `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` are absent, which is a
  supported state: every remote path no-ops.
- `auth-store.ts` / `actions.ts` — external auth store for
  `useSyncExternalStore`, friendly error mapping, sign in/up/out.
- Deliberately **not** `@supabase/ssr`: there is no server data layer and no
  cookie session to synchronise (shares will use an anonymous RPC), so cookie
  plumbing would be dead weight. Revisit only if SSR'd pages ever need a user.

**UI**

- `/auth` page (sign in / create account), linked from a new settings Sync
  section that also shows status, "Sync now" and "Sign out".
- `SyncProvider` drives sync on sign-in, tab focus, `online`, every 60 s while
  visible, and after local mutations (through mutation invalidation).

**Sync engine (`src/lib/sync/`)**

- `engine.ts` — stateless LWW reconcile against an injected adapter. Pulls a
  cheap `id, updated_at` manifest per table, then copies only what is missing
  or newer, with a 1 s grace window so round trips do not ping-pong.
- Deletions propagate via local **tombstones** (`Dexie` v4 table, wired into
  `purgeNotes`, `deleteNotebook`, `deleteTag`, `setNoteTags`,
  `removeTagFromNote`, `pruneUnusedTags`, and the two wipe paths in `seed.ts`).
- Conflicts never discard work: when a remote note overwrites a local one whose
  content differs, the local content is written to `versions` first.
- `supabase-adapter.ts` — PostgREST adapter with pagination (the response cap
  would otherwise look like data loss) and chunked writes.
- `mapping.ts` — the only place the Dexie dialect (camelCase, epoch ms, `""`
  null sentinel, `0 | 1`) meets the Postgres dialect (snake_case, ISO,
  booleans, real nulls).

## Deliberate limitations (documented, not accidental)

- **Attachments and version snapshots do not sync.** Bytes need Storage and
  version sync needs its own policy; both are a later phase.
- **Tags are push-dominant.** `Tag` has no local `updatedAt`, so a rename is
  indistinguishable from an untouched row. Missing tags pull down; all local
  tags upsert every pass. A future `updatedAt` on tags removes the waste.
- **`note_tags` removals are tombstone-only.** Additions copy both ways;
  a tag removed on device B and never tombstoned locally will be re-pulled
  from the server on device A. Acceptable until the join gains timestamps.
- **No Realtime.** Sync is reconcile on focus/interval; two tabs are not
  live-wired.

## Verification

- `typecheck`, **403 tests**, `lint`, `build` all clean. The engine has 5
  focused tests (push mapping, pull + conflict snapshot, equal-timestamp
  no-op, tombstone delete, join-table both ways).
- `npm run dev` with a real `.env.local` against `127.0.0.1:9020`:
  `/` 307, `/auth` `/notes` `/settings` `/trash` 200,
  `.next/dev/logs/next-development.log` has **0 errors**.
- An opt-in integration test (`supabase-adapter.integration.test.ts`, skipped
  without env vars) runs the real adapter against the live stack: push → RLS
  read-back → join row → purge → cascade, and a second pass is a no-op. Green.
- One bug caught by the suite during the work: a transaction read `noteTags`
  without declaring it — Dexie throws exactly the kind of `NotFoundError`
  that is invisible until runtime. Two more caught by the integration test:
  `tags` has no `updated_at`, so manifests and upserts use `created_at` there.

## Not done

- `/s/[token]` route + share creation UI (server RPC is ready and smoke-tested
  with password/expiry/revocation semantics).
- Attachment upload to the private bucket and signed-URL display.
- Vercel deployment + env vars + CORS/SITE_URL settings on the stack.
- Offsite backups.

## Addendum — 2026-10-02: TLS + Resend mail

- HTTPS is live: certbot cert for `supabase.example.com`,
  vhost rewritten to the Bolt pattern, smoke suite passes through the public
  TLS endpoint (commit `4d9eac6`).
- Resend SMTP configured in the stack `.env` with sender
  `noreply@example.com`; a real signup confirmation was sent to
  the owner's inbox, and the link flow was verified with a throwaway
  plus-address (`generate_link` → 303 → confirmed user).
- Known pre-launch behaviour: confirmation links redirect to `SITE_URL`, which
  is currently the API domain (Studio). Fix when the app is deployed by
  pointing `SITE_URL`/`ADDITIONAL_REDIRECT_URLS` at the app origin and passing
  `emailRedirectTo` from `signUp`.
- Remaining from the list above: share links, attachment sync, deployment,
  offsite backups.

## Addendum 2 — 2026-10-02: app deployed, redirects wired

- App is live at `https://sidenoteapp.vercel.app` (Vercel, branch `0.1.1`);
  client bundle verified to contain the API URL and anon key.
- Stack now uses `SITE_URL=https://sidenoteapp.vercel.app` and
  `ADDITIONAL_REDIRECT_URLS=http://localhost:3000,http://127.0.0.1:3000,https://sidenoteapp.vercel.app`.
  Probed: verify links stay on the API domain; redirects go to the app; a
  foreign `redirect_to` falls back to the app with an error fragment.
- `signUp` now passes `emailRedirectTo` and `detectSessionInUrl` is on, so the
  email loop ends signed in inside the app. Smoke suite green after the change.
- Vercel env vars live only in the Vercel dashboard; a redeploy is required
  after changing them.

## Addendum 3 — 2026-10-02: share links, branding, attachment sync

- Share links shipped: `/s/[token]` with optional password (bcrypt via
  `create_share`), expiry, copy, and revoke; `share_info` distinguishes
  "needs password" from "not found". Smoke covers all of it.
- Sign-in is now visible: sidebar entry + icon-rail button with sync status,
  not just a settings section. Expired confirmation links explain themselves.
- "Made with ❤️ by AW Builds" is permanent in the sidebar and on settings,
  auth and share pages.
- **Attachments sync as bytes** to the private bucket, with per-user soft
  deletes (propagates across devices) and a server-enforced **50 MB free
  budget** (`enforce_attachment_quota`) plus a 5 MB per-file bucket limit.
  Integration test covers upload → signed-URL download → quota rejection →
  tombstoned delete.
- Known limits: images inside shared links still render as a placeholder
  (the public viewer has no access to the sharer's bytes yet); version
  snapshots do not sync.
