# Architecture

A map of the system: what each layer is responsible for, where the trust
boundaries sit, and which states a post can legally be in.

---

## 1. Layers

Every layer below exists to keep a promise the layer above cannot keep alone.

```mermaid
flowchart TB
    subgraph TRUTH["🗄 Truth Layer"]
        T["products · projects · audiences · claims<br/><i>verified facts, approved and forbidden claims</i>"]
    end

    subgraph OS["🧠 Marketing OS"]
        S[Strategist] --> R[Research] --> P[Platform Strategy]
        P --> W["Writers · LinkedIn / Facebook / Instagram"]
    end

    subgraph STUDIO["🎬 Creative Studio"]
        CD[Creative Director] --> CC[Concepts] --> SB[Storyboard] --> SH[Shots]
        SH --> JQ[(generation_jobs)]
        JQ -.claim/complete.-> GPU["GPU worker<br/><i>external, x-worker-secret</i>"]
    end

    subgraph GATES["🛡 Quality Gates"]
        AV[Accuracy Validator] --> BR["Brand Gatekeeper<br/>score ≥ 85 · no hard fail"]
        BR --> HA["👤 Human approval"]
    end

    subgraph AUTO["🤖 Automation"]
        API["Automation API<br/><i>x-automation-secret</i>"]
        N8N[n8n]
    end

    subgraph CH["📡 Channels"]
        TG[Telegram]
        LI[LinkedIn]
        FB[Facebook]
        IG[Instagram]
        TT[TikTok]
    end

    TRUTH --> OS
    OS --> STUDIO
    OS --> GATES
    STUDIO --> GATES
    GATES --> AUTO
    N8N <--> API
    N8N --> CH
    CH --> AN["📊 post_analytics"]
    AN -.informs tomorrow.-> S
```

Two invariants hold the whole thing together:

1. **No unverified claim ships.** Writers may only state facts present in the
   Truth Layer. The accuracy validator rejects the rest before scoring happens.
2. **No publish without a human.** The AI scores and recommends; `ai_approved` is
   never sufficient. Only `human_approved_at` moves a post into the queue.

---

## 2. Planes

```
CONTROL PLANE     the app on Vercel — UI, agents, contracts, API
STATE PLANE       Supabase — Postgres, Auth, Storage, RLS
AUTOMATION PLANE  n8n, self-hosted — scheduling, publishing, collection
EXECUTION PLANE   GPU worker — image, video, voice, FFmpeg
```

The control plane never does heavy work. It writes a job and something else picks
it up. That is what lets the GPU worker move from a laptop to a rented GPU without
the dashboard noticing.

---

## 3. The automation request lifecycle

Routes live under `/api/public/` because no Supabase session authenticates them.
They are not public.

```mermaid
sequenceDiagram
    participant N as n8n
    participant G as Automation guard
    participant L as automation_requests
    participant H as Handler
    participant DB as Supabase

    N->>G: secret + timestamp + nonce (+ idempotency key)
    G->>G: constant-time digest compare
    G->>G: reject clock skew > 5 min
    G->>L: rate-limit window count
    G->>L: look up completed idempotency key
    L-->>G: cached response → replay verbatim
    G->>L: insert nonce (unique)
    Note over L: duplicate nonce → 409
    G->>H: run
    H->>DB: read / write
    H-->>G: response
    G->>L: store status + body
    G-->>N: JSON, always
```

Three separate credentials, never interchangeable:

| Credential | Used by | Reaches |
| --- | --- | --- |
| `x-automation-secret` | n8n | `/api/public/automation/*` |
| `x-worker-secret` | GPU worker | `/api/public/creative/*` |
| `x-telegram-bot-api-secret-token` | Telegram | `/api/public/telegram/webhook` |

---

## 4. Post state machine

The dangerous failure in a publisher is not a request that fails. It is a request
that **succeeds while the caller never learns it did** — retrying that posts the
same ad twice.

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> ai_approved: score ≥ 85, no hard fail
    draft --> needs_revision: gatekeeper rejects
    ai_approved --> approved: 👤 human approves
    ai_approved --> needs_revision: 👤 sends back
    approved --> publishing: claimed by publisher
    publishing --> published: platform confirms id
    publishing --> failed: definitive error
    publishing --> unknown: timeout / no answer
    unknown --> published: reconciled — found on platform
    unknown --> approved: reconciled — not found, safe retry
    published --> [*]
    note right of unknown
        Never returns to `publishing`
        on its own. A stale claim is
        quarantined here, not re-queued.
    end note
```

Enforced by:

- `UNIQUE (platform, platform_post_id)` — one row per real platform post
- `UNIQUE (publish_idempotency_key)` — one attempt per key
- `CHECK` on `status` — the vocabulary above and nothing else
- `outcome: "not_found"` accepted only from `unknown`

---

## 5. Directory map

```
src/
├── lib/
│   ├── agents.pipeline.ts      Strategist → Research → Platform Strategy →
│   │                           Writers → Image → Accuracy → Gatekeeper
│   ├── agents.server.ts        model access, prompt scaffolding
│   ├── ai-provider.server.ts   any OpenAI-compatible endpoint
│   ├── originality.ts          fingerprinting against recent output
│   ├── scoring.ts              penalties and score bands
│   ├── creative/               Creative Studio: concepts, storyboards, jobs
│   ├── platforms/              channel contracts
│   │   ├── types.ts            specs, adapter interface, error taxonomy
│   │   ├── registry.ts         one lookup for every channel
│   │   ├── telegram.ts         implemented
│   │   └── {linkedin,facebook,instagram,tiktok}.ts   contracts
│   └── automation/             the automation plane's server side
│       ├── guard.server.ts     secret, timestamp, nonce, idempotency, limits
│       ├── schemas.ts          request contracts
│       ├── approvals.server.ts human approval from outside the dashboard
│       └── telegram.server.ts  command centre
├── routes/
│   ├── _authenticated/         dashboard: products, knowledge, calendar,
│   │                           creative, publish, analytics, logs, tests
│   └── api/public/
│       ├── automation/         generate-today · approved · published · analytics
│       ├── creative/           claim · complete   (GPU worker)
│       └── telegram/           webhook
└── integrations/supabase/      browser client, admin client, auth middleware

supabase/migrations/            14 migrations, 26 tables
infra/n8n/                      self-hosted automation plane
scripts/smoke-automation.sh     W00 infrastructure test
```

---

## 6. Data model

26 tables in four groups.

| Group | Tables |
| --- | --- |
| **Truth** | `brand_profile` `categories` `products` `product_images` `audiences` `projects` `claims` |
| **Content** | `content_ideas` `posts` `post_analytics` `agent_runs` |
| **Creative** | `campaigns` `creative_references` `creative_concepts` `storyboards` `shots` `creative_assets` `generation_jobs` `creative_reviews` `ad_variants` |
| **Operations** | `social_accounts` `integrations` `automation_requests` `test_scenarios` `test_runs` `profiles` |

Analytics are stored twice on purpose: canonical columns that compare across every
channel, plus `raw_metrics` for whatever a single platform reports and nobody else
does — TikTok watch-time, LinkedIn demographics, Instagram navigation taps.

---

## 7. Secret handling

```mermaid
flowchart LR
    subgraph browser["Browser bundle"]
        V["VITE_SUPABASE_URL<br/>VITE_SUPABASE_PUBLISHABLE_KEY"]
    end
    subgraph server["Server only"]
        SR["SUPABASE_SERVICE_ROLE_KEY · AI_API_KEY<br/>AUTOMATION_SECRET · TELEGRAM_BOT_TOKEN<br/>TELEGRAM_WEBHOOK_SECRET · CREATIVE_WORKER_SECRET"]
    end
    browser -.->|"build fails on<br/>*.server.ts import"| server
```

Enforced, not documented:

- Vite import protection fails the build if a client module imports `*.server.ts`
- only `VITE_*` values are injected into the client
- `social_accounts` and `integrations` grant `authenticated` **column-level**
  SELECT that excludes every token; only `service_role` can read them

---

## 8. Status

| Phase | State |
| --- | --- |
| E0 Lovable removal | ✅ |
| E2 Social core | ✅ |
| E3 Publish state machine | ✅ |
| E6 Automation API | ✅ code-verified; live verification pending |
| E7 Telegram | ✅ |
| E1 External Supabase | ⏳ |
| E0.5 Vercel | ⏳ |
| W00–W01 n8n | ⏳ blocked on the two above |
| Meta · LinkedIn · TikTok | ⏳ blocked on platform approvals |

The channel table in the README tracks what each platform is waiting on.
