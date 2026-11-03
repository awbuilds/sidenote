# Self-hosting Sidenote

Sidenote has two independent pieces:

1. **The web app** — a Next.js application. Host it on Vercel, any Node.js
   server, or Docker.
2. **The sync backend (optional)** — Supabase. Without it the app is fully
   local. With it you get accounts, cross-device sync, and share links.

"Self-hosting" can mean either: run the app only (local-first), or run the app
plus your own Supabase. This guide covers both.

## 1. Local-only, no backend

```bash
npm ci
npm run dev      # http://localhost:3000
```

For production:

```bash
npm ci
npm run build
npm start
```

No environment variables are needed. All data lives in the browser's IndexedDB;
nothing is uploaded. Back up from Settings → Backup (ZIP).

## 2. Add your own Supabase (optional)

### 2.1 Create a Supabase project

Use Supabase Cloud, or follow the official self-hosting guide:
<https://supabase.com/docs/guides/self-hosting>.

### 2.2 Apply the schema

The SQL migrations live in `supabase/migrations/`. Apply them in filename order:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

or with `psql`:

```bash
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

The first migration creates the tables, RLS policies, the private
`attachments` storage bucket, and the share-link functions. Do not skip it.

### 2.3 Configure auth

In the Supabase dashboard → Authentication:

- Enable the **Email** provider (email + password).
- Set **Site URL** to your deployed origin, e.g. `https://notes.example.com`.
- Add redirect URLs for your origin, e.g. `https://notes.example.com/**`, and
  `http://localhost:3000/**` for local development.
- If you enable email confirmation, configure SMTP first; otherwise sign-ups
  will not receive a confirmation email.

### 2.4 Configure the app

Set these two variables in the **build** environment:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

`NEXT_PUBLIC_*` variables are inlined by Next.js **at build time**. Rebuild the
app after changing them. The anon key is public by design; RLS protects the
data. **Never** put the service-role key in the client or in these variables.

Without these variables the app stays fully local and shows no account UI.

## 3. Deploy the app

### Vercel

Import the repository, add the two `NEXT_PUBLIC_*` variables, deploy, and set
the production branch to `main`.

### Docker

Build args are build-time for the same reason:

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -t sidenote .
docker run --rm -p 3000:3000 sidenote
```

or, with the included compose file:

```bash
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... docker compose up --build
```

The image uses the Next.js standalone output and runs as a non-root user. For a
local-only image, omit the build args.

### Any Node host

```bash
npm ci
npm run build
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm start
```

The app listens on `PORT` (default 3000). Put it behind HTTPS: the service
worker and auth redirects require a secure origin.

## 4. Data and privacy

- **No sync configured:** all notes stay in the browser's IndexedDB. Nothing is
  uploaded.
- **Sync configured:** a user who signs in has their notebooks, notes, tags and
  attachments stored in *that deployment's* Supabase project. RLS scopes every
  row to `auth.uid()`, but the operator of the Supabase project can still access
  the database directly.
- **Share links:** public by token, optionally password-protected and expiring.
- **Backups:** the ZIP export is the only copy outside the browser/server. Back
  up the Supabase database and storage bucket too.
- The public demo at `sidenoteapp.vercel.app` is intended for local-first use.
  Sync and share links are enabled on a deployment that is configured with its
  own Supabase; self-host to use your own.

## 5. Security checklist

- Use HTTPS; set the Supabase Site URL and redirect allow-list.
- Keep the service-role key on the server only; the client uses the anon key.
- Review the RLS policies in `supabase/migrations/` before opening registration.
- Back up Postgres and the `attachments` bucket on a schedule.
- Keep the app and Supabase patched (`npm audit`, Dependabot, Supabase upgrades).

## 6. Updating

```bash
git pull
npm ci
npm run build
npm start
```

For Docker, rebuild the image and re-pass the build args if the backend changed.
Apply new `supabase/migrations/*.sql` in order before deploying app code that
depends on them.

## 7. Troubleshooting

- **No "Sign in" UI:** the two `NEXT_PUBLIC_*` variables were missing at build
  time. Rebuild.
- **Confirmation email never arrives:** configure SMTP in Supabase, or disable
  email confirmation for a private instance.
- **Auth redirects to localhost:** set the Site URL and redirect URLs to your
  deployed origin.
- **Sync errors after an upgrade:** apply the pending migrations; the schema and
  the app must be at the same revision.
