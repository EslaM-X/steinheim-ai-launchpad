# Working in this repository

## Non-negotiables

1. **The Truth Layer is the only source of product facts.** Agents may state a specification or a
   claim only if it exists in `products`, `projects` or `claims`. Never invent a flow rate, a
   finish, a certification or a project reference — the accuracy validator exists to catch exactly
   that, so do not weaken it.
2. **Nothing publishes without a human.** `ai_approved` is a recommendation. Only
   `human_approved_at` may move a post into the publish queue. Do not add a code path that skips it.
3. **Service-role credentials stay on the server.** `supabaseAdmin` and every token in
   `social_accounts` / `integrations` are server-only. Import `client.server.ts` inside a handler,
   never at the top level of a route or a `*.functions.ts` file — those ship to the browser bundle.
   The build enforces this: any client module importing a `*.server.ts` file fails the build.
4. **A publish attempt without a definitive answer is `unknown`, never `failed`.**

   ```
   approved → publishing ─┬─ confirmed ────────→ published
                          ├─ definitive error ─→ failed
                          └─ no answer ────────→ unknown → reconcile → published | approved
   ```

   `unknown` never transitions back to `publishing` on its own, and a stale claim is quarantined
   into `unknown` rather than re-queued. Treating "I did not hear back" as failure is what
   publishes the same ad twice.

## Layout

| Path | Contents |
| --- | --- |
| `src/lib/agents.*` | Marketing OS pipeline — strategist, research, writers, validators, gatekeeper |
| `src/lib/creative/` | Creative Studio — concepts, storyboards, jobs for the GPU worker |
| `src/lib/social/` | Platform adapter contract — per-channel specs, publish and metrics interfaces |
| `src/routes/api/public/` | Secret-authenticated endpoints for n8n and the GPU worker |
| `supabase/migrations/` | Schema, RLS and grants — additive, never edit a migration that has run |
| `infra/n8n/` | Self-hosted automation plane |
| `docs/plan/` | Phase plans |

## Conventions

- TypeScript strict. Agent outputs are validated with Zod schemas before they touch the database.
- Comments in English, in the style already present: explain *why*, not *what*.
- Conventional Commits.
- New tables need `GRANT` + `ENABLE ROW LEVEL SECURITY` + a policy, matching the existing
  migrations. Tables holding secrets get column-level grants instead of table-level ones.
- Verify with `npm run typecheck` and `npm run build` before claiming a change works.
