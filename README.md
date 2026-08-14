# Steinheim AI Launchpad

Marketing operating system for **Steinheim** (German luxury bathroom systems in Egypt). A verified
product knowledge base drives a team of AI agents that plan, write, illustrate and quality-check
daily content — and nothing reaches a social channel without a human approving it.

## Architecture

```text
Truth Layer          verified products, projects, audiences, approved/forbidden claims
      │
Marketing OS         Strategist → Research → Platform Strategy → Writers → Accuracy → Gatekeeper
      │
Creative Studio      Director → Concepts → Storyboard → Shots → Assets (via an external GPU worker)
      │
Quality Gates        AI approval (score ≥ 85, zero unverified claims) → human approval
      │
Automation (n8n)     scheduling, publishing, metrics collection
      │
Channels             LinkedIn · Facebook · Instagram · TikTok · Telegram
      │
Analytics            canonical metrics feed the next day's strategy
```

Two rules the whole system is built around:

1. **No unverified claim ships.** Writers may only use facts present in the Truth Layer; the
   accuracy validator rejects anything else.
2. **No publish without a human.** The AI recommends and scores; a person approves.

## Stack

TanStack Start (React 19, Vite) · Supabase (Postgres + Auth + Storage + RLS) · Vercel AI SDK
against any OpenAI-compatible provider · Tailwind 4 · deployed on Vercel.

## Setup

```bash
npm install
npm run dev
```

Environment variables:

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | client | browser Supabase client |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | server | SSR + auth middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | server | admin writes, bypasses RLS — never expose |
| `AI_BASE_URL`, `AI_API_KEY` | server | OpenAI-compatible LLM endpoint |
| `AI_MODEL`, `AI_IMAGE_MODEL` | server | optional model overrides |
| `CREATIVE_MODE` | server | `mock` (no GPU, no credits) / `local` / `cloud` |
| `CREATIVE_WORKER_SECRET` | server | shared secret for the GPU worker endpoints |

## Commands

```bash
npm run dev        # dev server
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run lint       # eslint
```

## Database

Migrations live in `supabase/migrations/` and run in filename order via the Supabase CLI:

```bash
supabase db push
```

## Automation

Self-hosted n8n (Community Edition — free, no account, no trial) lives in `infra/n8n/`:

```bash
cd infra/n8n && cp .env.example .env && docker compose up -d
```

## Docs

- [`docs/deployment.md`](docs/deployment.md) — Supabase + Vercel runbook, env var scoping, Telegram setup, smoke test
- [`docs/plan/`](docs/plan/) — phase plans

## Automation API

Four secret-authenticated endpoints under `/api/public/automation/` drive the daily
cycle from n8n: `generate-today`, `approved`, `published`, `analytics`. Every request
needs `x-automation-secret`, `x-automation-timestamp` and a single-use
`x-automation-nonce`; retries should carry an `Idempotency-Key`. The GPU worker
channel (`x-worker-secret`) is deliberately separate.

Verify a deployment with `./scripts/smoke-automation.sh`.
