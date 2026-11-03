# Handoff — Backend Phase 1: stack + initial schema

**Date:** 2026-10-02
**Branch:** `0.1.1`
**Status:** dedicated Supabase stack provisioned; initial schema applied and
verified end-to-end through the real API. App integration not started.

## What was built

**Server (self-hosted Supabase, tag `v1.26.08`)**

- Compose project `sidenote-prod`, 11 containers named `sidenote-*`, all
  healthy. Same pinned tag as the other stack, so every image was already
  cached; no new image downloads.
- Loopback-only ports: Kong `9020`/`9445`, pooler `5435`/`6545`. Host nginx
  vhost staged; **certbot pending a DNS record** for
  `supabase.example.com` (Cloudflare-managed).
- Fresh keys generated with `utils/generate-keys.sh` — no JWT secret or key is
  shared with either Bolt stack.
- 4 GB swapfile added (the host previously had none, with three stacks now
  running).
- Backups: `/usr/local/bin/sidenote-supabase-backup.sh` (db dump + storage
  tarball, 14-day retention) on cron at 03:15, restore drill performed.
- Realtime container renamed to `sidenote-realtime` **and** Kong's
  `volumes/api/kong.yml` upstreams updated to match. See the ops runbook for
  the same bug this pattern caused on the other stack.

**Repo**

- `supabase/config.toml` (CLI project init).
- `supabase/migrations/20261002191500_initial_schema.sql` — the §4.2 target
  schema: `profiles`, `notebooks`, `tags`, `notes`, `note_tags`,
  `attachments`, `versions`, `shares`. RLS on every table
  (`user_id = auth.uid()`), generated `tsvector`, `profiles` trigger on
  `auth.users`, `updated_at` triggers, 30/90-day version pruning trigger,
  `get_shared_note` security-definer RPC (password via `extensions.crypt`),
  private `attachments` bucket with `{user_id}/` policies.
- `supabase/smoke.sh` — end-to-end API verification, safe to rerun.
- `docs/SELF-HOSTING.md` — runbook (migrations, backups, restore,
  upgrades, quirks).

## Verification

- `supabase db push` applied cleanly (dry run first). One ownership fix: the
  image already enables RLS on `storage.objects`, so the migration must not
  `alter table` it.
- `supabase/smoke.sh` results: profile auto-created on signup; password sign-in
  works; owner CRUD works; cross-user insert → **403 RLS violation**; anon
  reads → **0 rows**; share RPC → correct title with no password, `[]` with a
  wrong password, title with the right one, `[]` for unknown tokens; storage
  upload/read works and cross-user upload is denied; version trigger keeps
  ≤30 rows and drops >90-day rows; user deletion cascades all app rows.
- Restore drill restored 50 tables into a scratch database.
- `supabase/config.toml` + SQL do not touch the TS build; still ran the four
  gates from a cold `node_modules`: typecheck, 204 tests, lint, build — all
  clean.
- Stack usage after start: **1.42 GiB**; host now has ~13 GiB available.

## Blockers / not done

- **DNS**: add `supabase-sidenote` → `192.0.2.1` (Cloudflare; use
  DNS-only for first issuance if SSL mode is Full/Strict), then
  `sudo certbot --nginx -d supabase.example.com`.
- **SMTP**: `.env` still has placeholder values. Signup confirmation mail will
  not send until real credentials replace `SMTP_HOST`/`USER`/`PASS`/
  `ADMIN_EMAIL`/`SENDER_NAME` and `docker compose up -d auth`. Until then,
  create users with the admin API (`email_confirm: true`) as the smoke test
  does.
- **Offsite backups**: local backups work; no offsite copy yet.
- **App integration (M3, next)**: `@supabase/ssr`, `/auth`, repository
  migration, Dexie→Postgres first-run importer, `/s/[token]`, attachments.
- **Vercel**: still not deployed (previous phase blocked on credentials). When
  it lands, set `SITE_URL`/`ADDITIONAL_REDIRECT_URLS` for the app origin and
  `NEXT_PUBLIC_SUPABASE_URL` + anon key in Vercel env.

## Decisions carried forward

- Server timestamps are authoritative for `updated_at` (trigger), giving
  last-write-wins a consistent clock; sync conflict surface is still an app
  decision.
- Version caps 30/90 are enforced server-side; client settings may lower them
  but cannot raise them.
- Client and server ids are both UUIDs (`crypto.randomUUID`), so the importer
  needs no id remapping — only epoch-ms → `timestamptz` conversion.
- The dedicated stack doubles as the development environment until launch;
  neither Bolt stack is touched.
