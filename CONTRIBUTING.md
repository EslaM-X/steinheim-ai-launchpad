# Contributing

Thanks for your interest. This project is designed so a first-time contributor
can land a small, reviewable change quickly.

## Ground rules

- **Small PRs.** One logical change per pull request.
- **Agent safety first.** This is an AI launchpad — never add a capability that
  moves funds, posts, or acts on-chain without explicit, reviewed approval.
- **Supabase via env.** Database and auth connect through environment
  variables; never commit keys, anon keys, or service-role keys.
- **Evidence over claims.** Promises in the README must link real implementation.

## Getting started

1. Fork and clone.
2. `npm install` (or `bun install`).
3. Copy `.env.example` to `.env.local` and fill in local Supabase + model keys.
4. `npm run dev` — the TanStack Start dev server.

## First contribution in 6 steps

1. Pick an open issue (labels: `good first issue`, `good first contribution`,
   `help wanted`, `documentation`).
2. Read the [code of conduct](CODE_OF_CONDUCT.md) and this guide.
3. Run `npm run lint` and `npm run typecheck` and keep them clean.
4. Open your pull request (use the [PR template](.github/PULL_REQUEST_TEMPLATE.md)).
5. Get reviewed — then your name goes on the contributor wall.

## Pull requests

- Add or update a test with every change.
- Keep `npm run lint` and `npm run typecheck` clean.
- Update `CHANGELOG.md` with your change.
- Link the issue your PR closes.

## Labels you can grab

- `good first issue` / `good first contribution` — small, well-scoped.
- `help wanted` — maintainers would like contributions.
- `documentation` — docs-only, great starting point.
- `accessibility` — UI accessibility improvements, very welcome.

## Code of conduct

Be respectful and constructive. See `CODE_OF_CONDUCT.md`.
