# Security policy

## Supported versions

The `main` branch is the supported version. Tagged releases are supported for
the lifetime of their release branch.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability
reporting:

<https://github.com/awbuilds/sidenote/security/advisories/new>

Include the version or commit, a description, and a minimal reproduction. You
can expect an acknowledgement within a few days.

## Scope

Sidenote is local-first. With no `NEXT_PUBLIC_SUPABASE_*` variables there is no
server, no account, and no network request of the app's own. When sync is
enabled, the relevant surfaces are:

- the browser Supabase client and the auth/session store;
- the LWW sync engine and its Supabase adapter;
- the Postgres RLS policies in `supabase/migrations/`;
- public share tokens (`/s/[token]`), including password and expiry handling.

The Supabase **anon key** is public by design. The **service-role key** must
never appear in the client or in this repository; if you find one, treat it as
a leak and report it privately.

## Out of scope

- Vulnerabilities in a self-hosted Supabase deployment that are not caused by
  this repository's migrations or client code.
- Reports that require a compromised browser profile or physical device access.
- Denial of service against your own self-hosted instance.
