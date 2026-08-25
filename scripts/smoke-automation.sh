#!/usr/bin/env bash
# W00 — Infrastructure smoke test for the automation API.
#
# Proves the security envelope end-to-end against a real deployment and a real
# Supabase, which is the part that could not be verified locally: nonce replay,
# idempotent replay and rate limiting all need the database.
#
#   APP_URL=https://your-app.vercel.app \
#   AUTOMATION_SECRET=... \
#   WORKER_SECRET=... \
#   ./scripts/smoke-automation.sh
#
# Reads only: every check runs against GET /approved. It never calls
# generate-today — that would spend AI credits and create real content.

set -u

APP_URL="${APP_URL:?set APP_URL}"
AUTOMATION_SECRET="${AUTOMATION_SECRET:?set AUTOMATION_SECRET}"
WORKER_SECRET="${WORKER_SECRET:-}"
RUN_RATE_LIMIT="${RUN_RATE_LIMIT:-0}"

BASE="${APP_URL%/}/api/public/automation"
PASS=0
FAIL=0

now_ms() { date +%s000; }
new_nonce() { echo "smoke-$(date +%s)-${RANDOM}${RANDOM}"; }

# expect <name> <expected-status> <curl args...>
expect() {
  name="$1"; want="$2"; shift 2
  got=$(curl -s -o /tmp/smoke.out -w '%{http_code}' "$@")
  if [ "$got" = "$want" ]; then
    PASS=$((PASS + 1)); printf '  ✅ %-44s %s\n' "$name" "$got"
  else
    FAIL=$((FAIL + 1)); printf '  ❌ %-44s got %s, want %s — %s\n' "$name" "$got" "$want" "$(head -c 120 /tmp/smoke.out)"
  fi
}

echo "W00 smoke test → $BASE"
echo

echo "Rejections:"
expect "no secret"            401 "$BASE/approved"
# Every long-running endpoint is checked unauthenticated, not just one. A guard
# wired onto three routes and forgotten on the fourth is the kind of gap that
# only shows up once something is already reachable.
#
# POST explicitly: these routes define no GET handler, so a GET falls through to
# the SSR page and answers 200 — which reads as "the guard is missing" when it
# is only the wrong verb.
expect "render-campaign: no secret" 401 "${BASE}/render-campaign" -X POST
expect "catalog-sync: no secret"    401 "${BASE}/catalog-sync" -X POST
expect "build-plates: no secret"    401 "${BASE}/build-plates" -X POST
expect "wrong secret"         401 "$BASE/approved" \
  -H "x-automation-secret: definitely-not-the-secret" \
  -H "x-automation-timestamp: $(now_ms)" -H "x-automation-nonce: $(new_nonce)"
expect "missing timestamp"    400 "$BASE/approved" -H "x-automation-secret: $AUTOMATION_SECRET"
expect "expired timestamp"    401 "$BASE/approved" \
  -H "x-automation-secret: $AUTOMATION_SECRET" \
  -H "x-automation-timestamp: $(( $(date +%s) - 7200 ))" -H "x-automation-nonce: $(new_nonce)"
expect "missing nonce"        400 "$BASE/approved" \
  -H "x-automation-secret: $AUTOMATION_SECRET" -H "x-automation-timestamp: $(now_ms)"

echo
echo "Acceptance:"
expect "valid request"        200 "$BASE/approved" \
  -H "x-automation-secret: $AUTOMATION_SECRET" \
  -H "x-automation-timestamp: $(now_ms)" -H "x-automation-nonce: $(new_nonce)"

echo
echo "Replay protection (needs the database):"
REUSED=$(new_nonce)
expect "first use of a nonce"  200 "$BASE/approved" \
  -H "x-automation-secret: $AUTOMATION_SECRET" \
  -H "x-automation-timestamp: $(now_ms)" -H "x-automation-nonce: $REUSED"
expect "same nonce replayed"   409 "$BASE/approved" \
  -H "x-automation-secret: $AUTOMATION_SECRET" \
  -H "x-automation-timestamp: $(now_ms)" -H "x-automation-nonce: $REUSED"

echo
echo "Idempotency (needs the database):"
IDEM="smoke-idem-$(date +%s)-$RANDOM"
curl -s -o /dev/null "$BASE/approved" \
  -H "x-automation-secret: $AUTOMATION_SECRET" \
  -H "x-automation-timestamp: $(now_ms)" -H "x-automation-nonce: $(new_nonce)" \
  -H "idempotency-key: $IDEM"
REPLAY=$(curl -s -D - -o /dev/null "$BASE/approved" \
  -H "x-automation-secret: $AUTOMATION_SECRET" \
  -H "x-automation-timestamp: $(now_ms)" -H "x-automation-nonce: $(new_nonce)" \
  -H "idempotency-key: $IDEM" | tr -d '\r' | grep -ci '^idempotent-replay: true')
if [ "$REPLAY" = "1" ]; then
  PASS=$((PASS + 1)); printf '  ✅ %-44s replayed\n' "retry with same idempotency-key"
else
  FAIL=$((FAIL + 1)); printf '  ❌ %-44s no idempotent-replay header\n' "retry with same idempotency-key"
fi

echo
echo "Channel separation:"
if [ -n "$WORKER_SECRET" ]; then
  # The worker credential must be useless against the automation API.
  expect "worker secret on automation endpoint" 401 "$BASE/approved" \
    -H "x-automation-secret: $WORKER_SECRET" \
    -H "x-automation-timestamp: $(now_ms)" -H "x-automation-nonce: $(new_nonce)"
  expect "automation secret on worker endpoint" 401 \
    -X POST "${APP_URL%/}/api/public/creative/claim" -H "x-worker-secret: $AUTOMATION_SECRET"
else
  echo "  ⏭  skipped (set WORKER_SECRET to run)"
fi

if [ "$RUN_RATE_LIMIT" = "1" ]; then
  echo
  echo "Rate limit (fills the window — run deliberately):"
  LIMIT="${AUTOMATION_RATE_LIMIT:-60}"
  i=0; last=200
  while [ "$i" -le "$LIMIT" ]; do
    last=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/approved" \
      -H "x-automation-secret: $AUTOMATION_SECRET" \
      -H "x-automation-timestamp: $(now_ms)" -H "x-automation-nonce: $(new_nonce)")
    i=$((i + 1))
  done
  if [ "$last" = "429" ]; then
    PASS=$((PASS + 1)); printf '  ✅ %-44s %s\n' "limit enforced after $LIMIT requests" "$last"
  else
    FAIL=$((FAIL + 1)); printf '  ❌ %-44s got %s, want 429\n' "limit enforced after $LIMIT requests" "$last"
  fi
fi

echo
echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
