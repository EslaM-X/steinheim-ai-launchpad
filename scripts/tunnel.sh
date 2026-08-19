#!/usr/bin/env bash
# Publishes the locally running app on a public HTTPS address.
#
# A quick tunnel needs no Cloudflare account and no DNS change, which is why it
# is the default here: steinheim-eg.com is the live company website and must not
# be repointed at this machine. The trade-off is that the hostname is issued per
# run — it changes every restart, so anything holding the old one (the Telegram
# webhook above all) has to be told the new address. This script does that.
#
#   scripts/tunnel.sh            # start a tunnel and register the webhook
#   scripts/tunnel.sh --no-hook  # start a tunnel only
#
# For an address that survives restarts you need a Cloudflare account and a
# domain other than the company site — a subdomain such as ops.example.com —
# then `cloudflared tunnel create` and a named tunnel. Quick tunnels are for
# getting someone remote onto the app today, not for production traffic.
set -euo pipefail

PORT="${PORT:-3000}"
CLOUDFLARED="${CLOUDFLARED:-cloudflared}"
command -v "$CLOUDFLARED" >/dev/null 2>&1 || \
  CLOUDFLARED="/c/Program Files (x86)/cloudflared/cloudflared.exe"
[ -x "$CLOUDFLARED" ] || command -v "$CLOUDFLARED" >/dev/null 2>&1 || {
  echo "cloudflared not found. Install it: winget install --id Cloudflare.cloudflared" >&2
  exit 1
}

curl -fsS -o /dev/null "http://localhost:$PORT/auth" || {
  echo "Nothing is serving http://localhost:$PORT — start the app first." >&2
  exit 1
}

LOG="$(mktemp -t cloudflared.XXXXXX)"
"$CLOUDFLARED" tunnel --url "http://localhost:$PORT" --no-autoupdate > "$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" 2>/dev/null || true' EXIT

URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 2
done
[ -n "$URL" ] || { echo "cloudflared did not report a hostname:" >&2; tail -20 "$LOG" >&2; exit 1; }

echo "public URL: $URL"
curl -fsS -o /dev/null -w "  /auth → %{http_code}\n" "$URL/auth"

if [ "${1:-}" != "--no-hook" ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]; then
  # The webhook stores an absolute URL, so a new tunnel silently breaks the bot
  # until it is re-registered. Doing it here keeps the two in step.
  curl -fsS -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
    -d "url=$URL/api/public/telegram/webhook" \
    -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
    -d 'allowed_updates=["message","callback_query"]' \
    | grep -q '"ok":true' && echo "  Telegram webhook → $URL/api/public/telegram/webhook"
fi

echo "Ctrl-C to stop."
wait "$TUNNEL_PID"
