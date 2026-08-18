# Go-live checklist

Everything that does not need your credentials is already built. What remains is
account setup, and it is short — but two things on this list cannot finish today
no matter how fast you work, and they are marked.

## What "working" means today

The first complete loop runs on **Telegram only**, because Telegram's Bot API is
the one channel that needs no platform review:

```
09:00 Cairo → generate → Truth Layer + Gatekeeper → Telegram approval
           → publish → record → reconcile
```

LinkedIn, Facebook, Instagram and TikTok are built to the same contract but
**cannot publish until each platform approves the app** — weeks of calendar time,
not work. Start those applications today so the clock runs while you use Telegram.

---

## The short path

Everything below except creating the accounts is automated. Fill in one file and
run one command:

```bash
cp .env.golive.example .env.golive   # paste your keys
./scripts/go-live.sh
```

It links Supabase, applies the migrations, verifies that tokens are not readable
with the public key, registers the Telegram bot and its approver, runs the smoke
test, triggers the first generation and prepares the n8n workflows — stopping at
the first thing that is actually wrong. It is safe to re-run.

The rest of this document is what that script does, in case you want to do it by
hand or something fails.

---

## 1 · Supabase — ~10 min

Create the project, then:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase migration list          # expect 14 Local / 0 Remote
supabase db push
```

Anything already in the Remote column: stop, do not push.

Verify:

```sql
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;

select column_name from information_schema.column_privileges
where table_name = 'social_accounts' and grantee = 'authenticated';
-- access_token must NOT appear
```

Enable **Google** under Authentication → Providers, and add your deployed origin
to the redirect URLs.

## 2 · AI provider — ~5 min

Any OpenAI-compatible endpoint. Without `AI_BASE_URL` and `AI_API_KEY` the agents
cannot run at all — this is the one dependency with no fallback.

## 3 · Vercel — ~10 min

Import the repo, add the variables from [deployment.md](deployment.md), deploy.
Nitro selects the Vercel preset on its own.

## 4 · Smoke test — ~2 min

```bash
APP_URL=https://<app> AUTOMATION_SECRET=... WORKER_SECRET=... ./scripts/smoke-automation.sh
```

All seven cases must pass. This is what turns the automation API from
code-verified into environment-verified — nonce replay, idempotent replay and
rate limiting have never run against a real database before this moment.

## 5 · Telegram — ~10 min

```bash
APP_URL=https://<app> TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
  ./scripts/setup-telegram.sh
```

Then insert the `integrations` row it prints, and send `/help`.

## 6 · n8n — ~20 min

Needs Docker Desktop.

```bash
cd infra/n8n && cp .env.example .env && docker compose up -d
```

Generate the importable workflows:

```bash
APP_URL=https://<app> TELEGRAM_CHAT_ID=... TELEGRAM_CHANNEL_ID=... \
  ./scripts/n8n-prepare.sh
```

Create the two credentials it names, import the three files from
`infra/n8n/workflows/ready/`, then activate:

| Workflow | Runs | Does |
| --- | --- | --- |
| **W01** | 09:00 Cairo | generate the day's content, notify Telegram |
| **W02** | every 15 min | claim approved posts, publish, record the outcome |
| **W03** | hourly | surface posts stuck in `unknown` for reconciliation |

Run W01 manually once before trusting the schedule.

## 7 · First real loop — ~10 min

1. Trigger W01 by hand → Telegram announces the generated content
2. Send `/pending` → approve a post from the chat
3. Wait for W02, or run it manually → the post appears in the channel
4. Confirm in the dashboard that it is `published` with a `platform_post_id`

That loop closing is the definition of done for today.

---

## Not today

| | Blocked on | Start now because |
| --- | --- | --- |
| Facebook | Meta App Review — `pages_manage_posts` | a Page admin can test before review |
| Instagram | Business account link + `instagram_content_publish` | same review queue |
| LinkedIn | Community Management API — `w_organization_social` | approval takes the longest |
| TikTok | Content Posting API audit — `video.publish` | unaudited clients post privately only |

Each adapter already exists as a contract with its endpoints documented in
`src/lib/platforms/`. When an approval lands, the work is implementing one
`publish()` and one `fetchMetrics()` — the queue, the state machine, the
analytics shape and the human approval are already in place and already tested.
