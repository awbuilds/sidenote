# Bolt dev stack: Realtime is unreachable (Kong upstream points at a renamed container)

**Found:** 2026-10-02, while provisioning the Sidenote stack.
**Affects:** `/opt/supabase-dev` (compose project `bolt-dev`). Production
(`bolt-prod`) is healthy.

## Summary

The Bolt dev stack renames every container to `supabase-dev-*` so it can run
alongside prod on the same Docker host. The Realtime container was renamed, but
Kong's declarative config was not: `volumes/api/kong.yml` still points at
`realtime-dev.supabase-realtime`, a name that no longer exists on the dev
network. Every `/realtime/v1/*` request through Kong fails to resolve its
upstream.

## Evidence

```bash
docker exec supabase-dev-kong sh -c 'getent hosts realtime-dev.supabase-realtime'
# -> nothing (name does not resolve)

docker exec supabase-dev-kong sh -c 'getent hosts supabase-dev-realtime'
# -> 10.0.4.8  supabase-dev-realtime

grep -n 'realtime-dev.supabase-realtime' /opt/supabase-dev/docker/volumes/api/kong.yml
# -> four upstream URLs: /socket, /api/openapi, /api/tenants, /api
```

## Why it is easy to miss

- All containers report `healthy`. Realtime's healthcheck calls
  `localhost:4000`, so it never exercises Kong's routing.
- Auth, REST and Storage work — only the Realtime upstream was affected.
- The container name looks "wrong" on purpose: upstream names it
  `realtime-dev.supabase-realtime` because the Realtime process parses its
  tenant from the subdomain (`realtime-dev`). Renaming the container is safe for
  Realtime itself; only DNS consumers must follow.

## Fix (dev stack only)

```bash
sed -i 's|http://realtime-dev\.supabase-realtime|http://supabase-dev-realtime|g' \
  /opt/supabase-dev/docker/volumes/api/kong.yml

cd /opt/supabase-dev/docker && docker compose up -d --force-recreate kong
```

Kong reads the declarative config at startup, so a restart is required.

Verify from inside Kong that the name resolves, then check the route:

```bash
docker exec supabase-dev-kong sh -c 'getent hosts supabase-dev-realtime'   # resolves

curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: <dev anon key>" \
  https://supabase.example.com/realtime/v1/
# before: 502/503 (no upstream); after: 4xx from Realtime (e.g. 426/401) but never 502
```

## Why prod works

`bolt-prod` kept the upstream container name `realtime-dev.supabase-realtime`,
so Kong's config still resolves. If prod is ever renamed to `supabase-prod-*`,
the same four URLs must be edited there too.

## General rule

Docker container names are host-global, so a second stack *must* rename its
containers — and every DNS reference to them (Kong upstreams, internal URLs)
must be renamed at the same time. The Sidenote stack renames `container_name`
**and** the four Realtime URLs in its `kong.yml` for exactly this reason.

## Adjacent finding (separate issue)

Both Bolt stacks still carry placeholder SMTP settings
(`SMTP_HOST=supabase-mail`, port `2500`, `fake_mail_user`) and no mail container
runs. Any email/password confirmation mail would fail to send; Google sign-in
is unaffected. Worth fixing if Bolt ever relies on email signup.
