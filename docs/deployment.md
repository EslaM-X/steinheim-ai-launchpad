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

| Migration                                    | Brings                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `20260814200000_phase_e2_social_core.sql`    | `social_accounts`, `integrations`, publish columns, canonical analytics |
| `20260814210000_phase_e6_automation_api.sql` | `automation_requests` — nonce, idempotency, rate-limit window           |

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

| Variable                        | Scope           | Notes                              |
| ------------------------------- | --------------- | ---------------------------------- |
| `VITE_SUPABASE_URL`             | client + server | public by design                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client + server | public by design                   |
| `SUPABASE_URL`                  | server          | same URL, read by SSR              |
| `SUPABASE_PUBLISHABLE_KEY`      | server          | same key, read by SSR              |
| `SUPABASE_SERVICE_ROLE_KEY`     | **server only** | bypasses RLS                       |
| `AI_BASE_URL`, `AI_API_KEY`     | **server only** | OpenAI-compatible endpoint         |
| `AI_MODEL`, `AI_IMAGE_MODEL`    | server          | optional overrides                 |
| `AUTOMATION_SECRET`             | **server only** | n8n credential                     |
| `AUTOMATION_RATE_LIMIT`         | server          | optional, defaults to 60/min       |
| `AUTOMATION_USER_ID`            | server          | optional; author of automated runs |
| `TELEGRAM_BOT_TOKEN`            | **server only** |                                    |
| `TELEGRAM_WEBHOOK_SECRET`       | **server only** |                                    |
| `CREATIVE_MODE`                 | server          | `mock` until a GPU worker exists   |
| `CREATIVE_WORKER_SECRET`        | **server only** | separate from `AUTOMATION_SECRET`  |

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

---

## If Vercel is not an option

Nothing in this application depends on Vercel. Nitro builds the same source for
several targets, all verified from this repository:

| Target              | Builds | Suits this app?                     |
| ------------------- | ------ | ----------------------------------- |
| `node-server`       | ✅     | **yes** — no request timeout        |
| `cloudflare-module` | ✅     | pages yes, generation no            |
| `netlify`           | ✅     | pages yes, generation no            |
| `static`            | ❌     | it is an SSR app with server routes |

The constraint that decides it: **a generation run measured 3m57s end to end.**
Cloudflare Workers and Netlify Functions cut a request long before that, so the
daily cycle would fail on both while the dashboard looked fine. A plain Node
process has no such ceiling.

So the recommended home is the machine that already has to exist for n8n:

```bash
cd infra/selfhost
cp .env.selfhost.example .env      # same values as the Vercel dashboard
docker compose up -d --build
```

That brings up the app on `:3000`, n8n on `:5678`, and Postgres for n8n's own
state. n8n reaches the app at `http://app:3000` over the internal network, so
the automation secret never crosses the public internet on that hop.

Point a domain at `:3000` behind any reverse proxy for TLS, then set `APP_URL`
and re-run `./scripts/go-live.sh` to move the Telegram webhook across.

## Reaching the app from somewhere else

Until a domain points at the box, the app is only on `localhost` — a colleague
on another network cannot open it at all. `scripts/tunnel.sh` publishes the
running process on a public HTTPS address:

```bash
scripts/tunnel.sh
```

It prints the address, checks that `/auth` answers through it, and re-registers
the Telegram webhook, which stores an absolute URL and would otherwise keep
pointing at a tunnel that no longer exists.

The address is issued per run and changes on every restart. That is the price of
a tunnel that needs no Cloudflare account and no DNS change — and no DNS change
is the point: `steinheim-eg.com` is the live company website and the catalogue
this system reads as its source of truth. Repointing it at a laptop would take
the shop down and empty the Truth Layer in the same move.

For an address that survives restarts, create a Cloudflare account, add a domain
that is _not_ the company site (a subdomain such as `ops.example.com` is enough),
and run `cloudflared tunnel create`. Then set `APP_URL` and re-run
`./scripts/go-live.sh`.

Nothing about the tunnel weakens the automation endpoints: they answer `401`
through it exactly as they do locally, because the guard checks the shared
secret rather than the network the request arrived on.

## Splitting the front end from the work

The measurements decide the shape. Every page in this app renders in single
digit milliseconds — the dashboard reads Supabase and nothing else. Three
operations do not: a catalogue sync takes minutes, and a generation run was
measured at 3m57s.

Netlify caps a synchronous function at **60 seconds**, fixed, on every plan.
That is comfortable for the pages and impossible for the work. So the two are
separated rather than compromised:

|                                        | runs on        | why                                                             |
| -------------------------------------- | -------------- | --------------------------------------------------------------- |
| Pages, auth, reading data              | Netlify        | fast, CDN, HTTPS, free, reachable from anywhere                 |
| Catalogue sync, generation, publishing | the Docker box | minutes-long, and nothing there cuts a request short            |
| n8n, its Postgres                      | the Docker box | already has to exist; reaches the app over the internal network |

The join is `WORKER_URL`. The UI's sync button calls the worker to _start_ a
job and gets an id back in about two seconds; it then polls the `jobs` table
for progress. Both halves are sub-second, so the presentation layer never comes
near its ceiling.

Leave `WORKER_URL` unset and the app calls itself, which is correct when the
whole stack is on one box and wrong on Netlify — set it there.

### What the jobs table buys

Before this, a sync held an HTTP request open for its whole duration. That
worked on a Node process and failed the user: closing the tab killed the run,
and a reload had no way to discover whether it had finished.

Now the request creates a row and returns. The worker writes progress into it,
the browser reads it, and the run is indifferent to what the browser does next.
Three properties follow, each verified against the live stack:

- **One sync at a time.** A unique partial index on `(kind) WHERE status IN
('queued','running')` means a second trigger — button or schedule — attaches
  to the run in flight instead of racing it. The synchronous endpoint answers
  `409` with the id of the run that already owns the slot.
- **A killed worker is visible.** The job heartbeats every 20 seconds. A
  `running` row whose heartbeat has gone stale belongs to a process that died,
  and `reap_dead_jobs()` marks it `interrupted` before the next run starts —
  otherwise a crash would hold the single-active slot forever.
- **Progress is real.** `phase`, `progress_done` and `progress_total` are
  written as each product is read, so the button shows `Reading up-basin-mixer
— 10/26` rather than a spinner.

### Deploying the presentation layer

`netlify.toml` is committed: `NITRO_PRESET=netlify`, publish `dist`. The
environment variables that layer needs are deliberately few — Supabase URL and
publishable key, `WORKER_URL`, `AUTOMATION_SECRET`. `SUPABASE_SERVICE_ROLE_KEY`
is not among them and must not be added: nothing on the presentation layer
needs to bypass row-level security, and a key that does has no business on a
public edge.
