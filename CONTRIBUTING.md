# Contributing to Sidenote

Thanks for taking the time. Sidenote is a local-first notes app with an optional
self-hosted backend; the most useful contributions keep that shape.

## Before you start

- Open an issue for anything larger than a bug fix. The surface is deliberately
  small: no AI, MCP, plugins, diagram notes, or mobile/desktop clients.
- Security issues go through [SECURITY.md](SECURITY.md), never a public issue.

## Development

Requires **Node 26** and npm 11.

```bash
npm ci
npm run dev      # http://localhost:3000
```

The app works without any environment variables: everything is local and every
remote path is a no-op. To exercise sync and share links you need a Supabase
instance; the runbook is [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md)
and the two public variables are in `.env.example`.

## Before opening a pull request

All four gates must be clean:

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```

They are necessary, not sufficient: client-side changes also need `npm run dev`
and a read of `.next/dev/logs/next-development.log`.

If you touched `src/lib/db/`, the save path, images, or transfer code, read the
storage invariants in [AGENTS.md](AGENTS.md) first. They are not style
preferences; they are why the backup path is trustworthy.

## Pull requests

- Branch from `main`, keep the change scoped, and include a test for logic
  changes.
- `main` is protected: pull requests only, and the `ci` check must pass.
- Use a conventional commit subject (`feat:`, `fix:`, `perf:`, `docs:`,
  `build:`, `chore:`).
- Do not add attribution trailers (`Co-Authored-By`, `Generated-by`, or similar)
  naming a tool, model, or vendor.
- UI changes: include a screenshot or a short recording.

## Licence

By contributing you agree that your contribution is licensed under the
GNU AGPL-3.0, the licence of this repository.
