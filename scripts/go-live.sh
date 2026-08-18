#!/usr/bin/env bash
# Everything that can be automated, automated.
#
#   cp .env.golive.example .env.golive   # fill it in
#   ./scripts/go-live.sh
#
# Idempotent: safe to re-run after fixing one value. Each phase verifies itself
# and stops with the exact thing to fix rather than continuing on a bad state.

set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.golive ]; then
  echo "❌ .env.golive not found — copy .env.golive.example and fill it in"
  exit 1
fi
set -a
. ./.env.golive
set +a

FAILED=0
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '   ✅ %s\n' "$*"; }
warn() { printf '   ⚠️  %s\n' "$*"; }
die()  { printf '   ❌ %s\n' "$*"; FAILED=1; }
need() {
  if [ -z "${!1:-}" ]; then die "$1 is empty in .env.golive"; fi
}

# Reads JSON from stdin and prints one field. Node, because jq is not a given.
jget() {
  node -e "
let d='';
process.stdin.on('data', c => d += c).on('end', () => {
  try { const j = JSON.parse(d); const v = eval(process.argv[1]); console.log(v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : v); }
  catch (e) { console.log(''); }
});" "$1"
}

# ── Phase 0 · configuration ──────────────────────────────────────────────────
step "0 · Configuration"
for v in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD \
         SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY AI_BASE_URL AI_API_KEY \
         TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET AUTOMATION_SECRET; do
  need "$v"
done
if [ ${#AUTOMATION_SECRET} -lt 24 ]; then
  warn "AUTOMATION_SECRET is short — use 32+ random characters"
fi
if [ $FAILED -ne 0 ]; then
  echo
  echo "Fix the above and re-run."
  exit 1
fi
ok "all required values present"

# ── Phase 1 · database ───────────────────────────────────────────────────────
step "1 · Supabase — link, migrate, verify"
export SUPABASE_ACCESS_TOKEN
if supabase link --project-ref "$SUPABASE_PROJECT_REF" -p "$SUPABASE_DB_PASSWORD" >/dev/null 2>&1; then
  ok "linked to $SUPABASE_PROJECT_REF"
else
  die "link failed — check SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN"
  exit 1
fi

LOCAL_COUNT=$(find supabase/migrations -name '*.sql' | wc -l | tr -d ' ')
applied_count() {
  supabase migration list -p "$SUPABASE_DB_PASSWORD" 2>/dev/null \
    | grep -cE '^[[:space:]]*[0-9]{14}[[:space:]]*\|[[:space:]]*[0-9]{14}'
}
REMOTE_BEFORE=$(applied_count)
echo "   local migrations: $LOCAL_COUNT · already applied remotely: $REMOTE_BEFORE"

if [ "$REMOTE_BEFORE" -eq "$LOCAL_COUNT" ]; then
  ok "schema already up to date"
else
  supabase db push -p "$SUPABASE_DB_PASSWORD" --yes 2>&1 | tail -3
  APPLIED=$(applied_count)
  if [ "$APPLIED" -eq "$LOCAL_COUNT" ]; then
    ok "$APPLIED/$LOCAL_COUNT migrations applied"
  else
    die "only $APPLIED/$LOCAL_COUNT applied — read the error above before re-running"
  fi
fi

REST="${SUPABASE_URL%/}/rest/v1"

# The security property that actually matters: tokens invisible to the anon key.
if [ -n "${SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  LEAK=$(curl -s "$REST/social_accounts?select=access_token&limit=1" \
    -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -o /dev/null -w '%{http_code}')
  if [ "$LEAK" = "200" ]; then
    die "anon key can read social_accounts.access_token — grants are wrong, stop here"
  else
    ok "token columns not readable with the publishable key (HTTP $LEAK)"
  fi
fi

TABLES=$(curl -s "$REST/posts?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -o /dev/null -w '%{http_code}')
if [ "$TABLES" = "200" ]; then
  ok "service role reaches the schema"
else
  die "service role cannot read posts (HTTP $TABLES) — check SUPABASE_SERVICE_ROLE_KEY"
fi

# ── Phase 2 · Telegram ───────────────────────────────────────────────────────
step "2 · Telegram — bot, chat, approver, webhook"
TG="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
BOT=$(curl -s "$TG/getMe" | jget "j.result && j.result.username")
if [ -n "$BOT" ]; then
  ok "bot @$BOT"
else
  die "bot token rejected by Telegram"
  exit 1
fi

if [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "   … send any message to @$BOT now, then press Enter"
  read -r _ </dev/tty 2>/dev/null || true
  UPD=$(curl -s "$TG/getUpdates")
  TELEGRAM_CHAT_ID=$(echo "$UPD" | jget "j.result && j.result.length ? j.result[j.result.length-1].message.chat.id : ''")
  TELEGRAM_USER_ID=$(echo "$UPD" | jget "j.result && j.result.length ? j.result[j.result.length-1].message.from.id : ''")
fi

if [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  ok "chat id $TELEGRAM_CHAT_ID (telegram user ${TELEGRAM_USER_ID:-unknown})"

  # Who may approve is a permission, not a lookup. Picking "the first profile"
  # would attribute a publishing decision to whoever happens to sort first.
  APPROVER="${SUPABASE_APPROVER_USER_ID:-}"
  TG_APPROVER="${TELEGRAM_APPROVER_USER_ID:-${TELEGRAM_USER_ID:-}}"

  if [ -z "$APPROVER" ]; then
    echo "   Sign in to the app once, then choose your user:"
    curl -s "$REST/profiles?select=id,display_name&limit=10" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      | jget "JSON.stringify(j, null, 1)" | sed 's/^/     /'
    die "set SUPABASE_APPROVER_USER_ID in .env.golive — an approval must name a real person"
  elif [ -z "$TG_APPROVER" ]; then
    die "set TELEGRAM_APPROVER_USER_ID in .env.golive"
  else
    # Verify the uuid exists rather than trusting the paste.
    FOUND=$(curl -s "$REST/profiles?select=id&id=eq.$APPROVER" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jget "j[0] ? j[0].id : ''")
    if [ "$FOUND" = "$APPROVER" ]; then
      ok "Telegram user $TG_APPROVER may approve as Supabase user $APPROVER"
    else
      die "SUPABASE_APPROVER_USER_ID $APPROVER is not a profile in this project"
    fi
  fi

  curl -s -X POST "$REST/integrations" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -d "{\"kind\":\"telegram\",\"name\":\"command-centre\",\"external_id\":\"$TELEGRAM_CHAT_ID\",\"status\":\"active\",\"config\":{\"approvers\":{\"$TG_APPROVER\":\"$APPROVER\"}}}" \
    -o /dev/null
  ok "integrations row upserted"
else
  die "no message found — message the bot first, then re-run"
fi

if [ -n "${APP_URL:-}" ]; then
  HOOK_OK=$(curl -s -X POST "$TG/setWebhook" \
    --data-urlencode "url=${APP_URL%/}/api/public/telegram/webhook" \
    --data-urlencode "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
    --data-urlencode 'allowed_updates=["message","callback_query"]' | jget "j.ok")
  if [ "$HOOK_OK" = "true" ]; then ok "webhook registered"; else die "setWebhook failed"; fi
else
  warn "APP_URL empty — webhook skipped until the app is deployed"
fi

# ── Phase 3 · the deployed app ───────────────────────────────────────────────
step "3 · Deployed app"
if [ -z "${APP_URL:-}" ]; then
  warn "APP_URL empty — smoke test and first run skipped"
  echo
  echo "   Set these in Vercel, deploy, put the URL in .env.golive, re-run this script:"
  echo "     VITE_SUPABASE_URL            = $SUPABASE_URL"
  echo "     VITE_SUPABASE_PUBLISHABLE_KEY= ${SUPABASE_PUBLISHABLE_KEY:-<publishable key>}"
  echo "     SUPABASE_URL                 = $SUPABASE_URL"
  echo "     SUPABASE_PUBLISHABLE_KEY     = ${SUPABASE_PUBLISHABLE_KEY:-<publishable key>}"
  echo "     SUPABASE_SERVICE_ROLE_KEY    = <service role key>   (server only)"
  echo "     AI_BASE_URL                  = $AI_BASE_URL"
  echo "     AI_API_KEY                   = <your key>           (server only)"
  echo "     AI_MODEL                     = ${AI_MODEL:-<model slug>}"
  echo "     AUTOMATION_SECRET            = <your secret>        (server only)"
  echo "     TELEGRAM_BOT_TOKEN           = <bot token>          (server only)"
  echo "     TELEGRAM_WEBHOOK_SECRET      = <webhook secret>     (server only)"
  echo "     CREATIVE_MODE                = mock"
  echo "     CREATIVE_WORKER_SECRET       = ${CREATIVE_WORKER_SECRET:-<worker secret>}"
else
  if APP_URL="${APP_URL%/}" AUTOMATION_SECRET="$AUTOMATION_SECRET" \
     WORKER_SECRET="${CREATIVE_WORKER_SECRET:-}" ./scripts/smoke-automation.sh; then
    ok "smoke test passed — the automation API is environment-verified"
  else
    die "smoke test failed — do not wire n8n on top of this yet"
  fi

  step "4 · Verification run"
  echo "   Runs the full pipeline and marks the output as a test, so nothing"
  echo "   produced by this first run can reach a channel."
  OUT=$(curl -s -X POST "${APP_URL%/}/api/public/automation/generate-today?mode=verification" \
    -H "x-automation-secret: $AUTOMATION_SECRET" \
    -H "x-automation-timestamp: $(date +%s)" \
    -H "x-automation-nonce: golive-$(date +%s)-$RANDOM" \
    -H "idempotency-key: golive-$(date +%F)")
  TOPIC=$(echo "$OUT" | jget "j.topic")
  if [ -n "$TOPIC" ]; then
    ok "generated: $TOPIC — score $(echo "$OUT" | jget 'j.score')/100, unverified claims $(echo "$OUT" | jget 'j.unverifiedClaims')"
    MODE=$(echo "$OUT" | jget "j.mode")
    if [ "$MODE" = "verification" ]; then
      ok "marked as a verification run — excluded from every publish queue"
    else
      die "expected a verification run, got '$MODE' — this output could be published"
    fi
  else
    die "generation failed: $(echo "$OUT" | head -c 200)"
  fi

  step "5 · n8n workflows"
  APP_URL="${APP_URL%/}" TELEGRAM_CHAT_ID="$TELEGRAM_CHAT_ID" \
    TELEGRAM_CHANNEL_ID="${TELEGRAM_CHANNEL_ID:-$TELEGRAM_CHAT_ID}" ./scripts/n8n-prepare.sh
fi

echo
if [ $FAILED -eq 0 ]; then
  echo "🟢 Environment verified. Nothing has been staged for publishing."
  echo "   Review the verification run in the dashboard, then run a production"
  echo "   cycle when you are ready:"
  echo "     POST /api/public/automation/generate-today   (no mode parameter)"
else
  echo "🔴 Finished with the failures listed above."
  exit 1
fi
