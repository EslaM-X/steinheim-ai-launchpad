# Deployment runbook — external Supabase + Vercel

Order matters: Supabase first, because every migration (Social Core, the automation
ledger, the publish claim, the analytics constraints) must land on the project that
will be production. Wiring n8n against a throwaway database means doing it twice.

## 1. Supabase project

1. Create the project. Pick the region closest to Cairo.
2. Copy from **Project Settings → API**:
   - Project URL
   - Publishable key (`sb_publishable_…`; a legacy `anon` JWT works too)
   - **Secret / service-role key** (`sb_secret_…`) — server-side only, forever
3. Apply migrations in filename order:

```bash
supabase link --project-ref <ref> && supabase db push
```

The two newest must both apply cleanly:

| Migration | Brings |
| --- | --- |
| `20260814200000_phase_e2_social_core.sql` | `social_accounts`, `integrations`, publish columns, canonical analytics |
| `20260814210000_phase_e6_automation_api.sql` | `automation_requests` — nonce, idempotency, rate-limit window |

4. Verify the security posture before trusting it:

```sql
-- Every table must have RLS on.
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;

-- Tokens must NOT be selectable by `authenticated`.
-- Expect: rows for the non-secret columns only, nothing for access_token.
select column_name from information_schema.column_privileges
where table_name = 'social_accounts' and grantee = 'authenticated';
```

5. Enable the **Google** provider under Authentication → Providers, and add the
   deployed origin to the redirect URLs. Google sign-in goes through Supabase
   directly now, so it will not work until this is done.

## 2. Vercel

Import the repo. The build is `npm run build`; Nitro detects Vercel from the CI
environment and selects its preset on its own.

| Variable | Scope | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | client + server | public by design |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client + server | public by design |
| `SUPABASE_URL` | server | same URL, read by SSR |
| `SUPABASE_PUBLISHABLE_KEY` | server | same key, read by SSR |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | bypasses RLS |
| `AI_BASE_URL`, `AI_API_KEY` | **server only** | OpenAI-compatible endpoint |
| `AI_MODEL`, `AI_IMAGE_MODEL` | server | optional overrides |
| `AUTOMATION_SECRET` | **server only** | n8n credential |
| `AUTOMATION_RATE_LIMIT` | server | optional, defaults to 60/min |
| `AUTOMATION_USER_ID` | server | optional; author of automated runs |
| `TELEGRAM_BOT_TOKEN` | **server only** | |
| `TELEGRAM_WEBHOOK_SECRET` | **server only** | |
| `CREATIVE_MODE` | server | `mock` until a GPU worker exists |
| `CREATIVE_WORKER_SECRET` | **server only** | separate from `AUTOMATION_SECRET` |

**Never prefix a secret with `VITE_`.** That prefix is exactly what puts a value in
the browser bundle. Two things already enforce this:

- the build fails if any client module imports a `*.server.ts` file
- only `VITE_*` values are injected into the client

Confirm it on any build:

```bash
npm run build
grep -rl "SUPABASE_SERVICE_ROLE_KEY\|TELEGRAM_BOT_TOKEN\|AUTOMATION_SECRET" .output/public
# expect: no output
```

## 3. Telegram

1. Create the bot with @BotFather, keep the token.
2. Register the webhook with a secret token of your own choosing:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<app>/api/public/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

3. Register the chat and its approvers. `approvers` maps a Telegram user id to a
   Supabase user uuid, so an approval keeps a real author in `human_approved_by`:

```sql
insert into public.integrations (kind, name, external_id, status, config)
values (
  'telegram', 'command-centre', '<chat_id>', 'active',
  '{"approvers": {"<telegram_user_id>": "<supabase_user_uuid>"}}'::jsonb
);
```

Then send `/help` in the chat. No response means the row is missing, inactive, or
the chat id does not match.

## 4. Infrastructure smoke test (W00)

Run before building any n8n workflow — it covers the three guarantees that could
not be verified without a database:

```bash
APP_URL=https://<app> AUTOMATION_SECRET=... WORKER_SECRET=... ./scripts/smoke-automation.sh
```

Add `RUN_RATE_LIMIT=1` to also fill the window and assert the 429. The script only
reads; it never calls `generate-today`, which would spend AI credits.

## 5. Only then, n8n

W01 stays deliberately small: cron → `generate-today` → check → Telegram notify.
Publishing is a separate workflow. Do not merge them.
