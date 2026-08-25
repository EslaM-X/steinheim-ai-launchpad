<div align="center">

# Steinheim AI Launchpad

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![CI](https://github.com/EslaM-X/steinheim-ai-launchpad/actions/workflows/ci.yml/badge.svg)](https://github.com/EslaM-X/steinheim-ai-launchpad/actions)

**A marketing operating system that cannot lie about the product.**

A verified knowledge base drives a team of AI agents that plan, write, illustrate
and quality-check daily content for [Steinheim](https://steinheim-eg.com) —
German luxury bathroom systems in Egypt. Every claim is traced to a fact. Every
post waits for a human.

`TanStack Start` · `React 19` · `Supabase` · `Vercel AI SDK` · `n8n` · `Tailwind 4`

</div>

---

## Why this exists

Most "AI social media" tools generate plausible sentences. For a technical product
sold to architects, developers and hospitality buyers, a plausible sentence is a
liability: an invented flow rate or a fabricated project reference is a claim the
company has to answer for.

So the system is built around two rules that are enforced in code, not in prompts:

> **1. No unverified claim ships.**
> Writers may only state facts that exist in the Truth Layer — approved product
> specifications, approved claims, real projects. An accuracy validator rejects
> everything else _before_ the content is ever scored.
>
> **2. No publish without a human.**
> The AI scores and recommends. `ai_approved` is never sufficient. Only a human
> approval moves a post into the publish queue — from the dashboard or from
> Telegram, never from an agent.

---

## How it works

```mermaid
flowchart LR
    T["🗄 Truth Layer<br/><sub>products · projects<br/>audiences · claims</sub>"]
    A["🧠 Agents<br/><sub>strategy · research<br/>writing · imagery</sub>"]
    Q["🛡 Quality gates<br/><sub>accuracy · brand<br/>score ≥ 85</sub>"]
    H["👤 Human<br/><sub>approval</sub>"]
    N["🤖 n8n<br/><sub>schedule · publish<br/>collect</sub>"]
    C["📡 Channels<br/><sub>LinkedIn · Facebook<br/>Instagram · TikTok · Telegram</sub>"]
    M["📊 Performance"]

    T --> A --> Q --> H --> N --> C --> M
    M -.->|informs tomorrow| A
```

A single day, end to end: the **Strategist** decides what deserves saying today
based on rotation, audience and past performance. **Research** gathers only
approved facts. **Platform Strategy** decides how the idea lands differently on
each channel. Three **Writers** produce native copy. The **Image agent** writes
the visual brief. The **Accuracy Validator** checks every claim against the Truth
Layer. The **Brand Gatekeeper** scores nine dimensions and blocks anything under
85 or carrying a hard fail. Then it stops, and waits for a person.

### The agent team

| Agent                     | Decides                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| 🧠 **Strategist**         | what to say today, to whom, at which funnel stage                  |
| 🔎 **Research**           | which approved facts support it                                    |
| 🎯 **Platform Strategy**  | how the idea differs per channel                                   |
| ✍️ **Writers** ×3         | native copy for LinkedIn, Facebook, Instagram — Arabic and English |
| 🖼 **Image agent**         | the visual brief, in the brand's language                          |
| 🔍 **Accuracy Validator** | whether every claim is verifiable                                  |
| 🛡 **Brand Gatekeeper**    | whether this deserves to represent the brand                       |
| 🎬 **Creative Studio**    | concept → storyboard → shots → assets, via an external GPU worker  |

Agents never publish. They produce, score, and hand over.

---

## Channels

TikTok and Telegram are first-class in the schema, the adapters and the analytics
from day one — so switching them on is configuration, not a refactor.

| Channel       | Publishing  | Waiting on                                          |
| ------------- | ----------- | --------------------------------------------------- |
| **Telegram**  | ✅ live     | —                                                   |
| **Facebook**  | 🔨 contract | Meta App Review (`pages_manage_posts`)              |
| **Instagram** | 🔨 contract | Business account link + `instagram_content_publish` |
| **LinkedIn**  | 🔨 contract | Community Management API (`w_organization_social`)  |
| **TikTok**    | 🔨 contract | Content Posting API audit (`video.publish`)         |

Telegram is also the **command centre**: `/status`, `/today`, `/pending`,
`/analytics`, with inline approve and reject. Approving queues a post — it never
publishes from the chat.

---

## Quick start

```bash
npm install
npm run dev
```

| Command             |                       |
| ------------------- | --------------------- |
| `npm run dev`       | dev server on `:8080` |
| `npm run typecheck` | `tsc --noEmit`        |
| `npm run build`     | production build      |
| `npm run lint`      | eslint                |

Database — 14 migrations, 26 tables:

```bash
supabase db push
```

Self-hosted automation — n8n Community Edition, free with no account and no trial:

```bash
cd infra/n8n && cp .env.example .env && docker compose up -d
```

Go live — one file of keys, one command:

```bash
cp .env.golive.example .env.golive && ./scripts/go-live.sh
```

Full deployment path in **[docs/go-live.md](docs/go-live.md)** and **[docs/deployment.md](docs/deployment.md)**.

---

## Configuration

| Variable                                            | Scope           | Purpose                                                                    |
| --------------------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL` `VITE_SUPABASE_PUBLISHABLE_KEY` | client          | public by design                                                           |
| `SUPABASE_URL` `SUPABASE_PUBLISHABLE_KEY`           | server          | SSR and auth middleware                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`                         | **server only** | admin writes, bypasses RLS                                                 |
| `AI_BASE_URL` `AI_API_KEY`                          | **server only** | any OpenAI-compatible endpoint                                             |
| `AI_MODEL` `AI_IMAGE_MODEL`                         | server          | optional overrides                                                         |
| `AI_STREAMING`                                      | server          | set to `false` for providers that reject streaming with structured outputs |
| `AUTOMATION_SECRET`                                 | **server only** | n8n credential                                                             |
| `TELEGRAM_BOT_TOKEN` `TELEGRAM_WEBHOOK_SECRET`      | **server only** | command centre                                                             |
| `CREATIVE_MODE` `CREATIVE_WORKER_SECRET`            | server          | GPU worker channel                                                         |

Changing LLM provider is a deployment change, never a code change.

---

## Automation API

Four endpoints under `/api/public/automation/` drive the daily cycle from n8n.
They sit under `public` because no Supabase session authenticates them — they are
**not public**.

| Endpoint              |                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST generate-today` | run the daily content cycle                                                                              |
| `GET approved`        | the publish queue; `?claim=true` claims atomically, `?state=unknown` lists posts awaiting reconciliation |
| `POST published`      | record the outcome of a publish attempt                                                                  |
| `POST analytics`      | ingest a metrics snapshot                                                                                |

Every request carries a shared secret compared in constant time, a timestamp
inside a five-minute window, and a single-use nonce. Retries carry an
`Idempotency-Key` and get the first attempt's response replayed verbatim.

```bash
curl -X POST "$APP/api/public/automation/generate-today" \
  -H "x-automation-secret: $AUTOMATION_SECRET" \
  -H "x-automation-timestamp: $(date +%s)" \
  -H "x-automation-nonce: $(uuidgen)" \
  -H "idempotency-key: daily-$(date +%F)"
```

### The hard part: never publishing twice

The dangerous failure is not a request that fails. It is a request that **succeeds
while the caller never learns it did**. Retrying that posts the same ad twice.

```
publishing ─┬─ confirmed ────────► published
            ├─ definitive error ─► failed
            └─ no answer ────────► unknown ──► reconcile ──► published
                                                         └─► approved (safe retry)
```

`unknown` never returns to `publishing` on its own, and a claim abandoned by a
dead worker is quarantined rather than re-queued. Backed by
`UNIQUE (platform, platform_post_id)`, `UNIQUE (publish_idempotency_key)` and a
`CHECK` on the status vocabulary.

---

## Security model

Three credentials, never interchangeable: `x-automation-secret` for n8n,
`x-worker-secret` for the GPU worker, `x-telegram-bot-api-secret-token` for
Telegram. A leak of one grants nothing in the others.

Secrets never reach the browser, and this is **enforced rather than documented**:

- the build **fails** if any client module imports a `*.server.ts` file
- only `VITE_*` values are injected into the client bundle
- `social_accounts` and `integrations` grant `authenticated` column-level SELECT
  that excludes every token; only `service_role` can read them

Verify on any build:

```bash
npm run build && grep -rl "SUPABASE_SERVICE_ROLE_KEY\|TELEGRAM_BOT_TOKEN" .output/public
# expect no output
```

Verify a deployment end to end:

```bash
APP_URL=https://<app> AUTOMATION_SECRET=... ./scripts/smoke-automation.sh
```

---

## Project layout

```
src/lib/agents.*        Marketing OS pipeline
src/lib/creative/       Creative Studio
src/lib/platforms/      channel contracts + registry
src/lib/automation/     guard, schemas, approvals, Telegram
src/routes/             dashboard + secured API routes
supabase/migrations/    schema, RLS, grants
infra/n8n/              self-hosted automation plane
scripts/                infrastructure smoke test
```

---

## Documentation

|                                          |                                                        |
| ---------------------------------------- | ------------------------------------------------------ |
| **[Go-live checklist](docs/go-live.md)** | the shortest path from a fresh clone to a working loop |
| **[Architecture](docs/architecture.md)** | layers, request lifecycle, state machine, data model   |
| **[Deployment](docs/deployment.md)**     | Supabase → Vercel → Telegram → smoke test              |
| **[Contributing rules](AGENTS.md)**      | the invariants any change must preserve                |
| **[Phase plans](docs/plan/)**            | how the system was designed                            |

---

## Contributing

Contributions are welcome — launchpads are only as good as their community.
Start with the [Contributing Guide](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md), and respect the
[invariants in AGENTS.md](AGENTS.md).

- **Good first issues** are labelled `good first issue` / `good first contribution`.
- Every change keeps `npm run lint` and `npm run typecheck` clean.
- See the [changelog](CHANGELOG.md) for release history.

<div align="center">
<sub>Water, designed. · الماء، بتصميم</sub>
</div>
