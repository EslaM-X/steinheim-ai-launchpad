#!/usr/bin/env bash
# Fills the placeholders in the workflow templates and writes importable copies
# to infra/n8n/workflows/ready/. Editing three JSON files by hand is how a typo
# reaches production.
#
#   APP_URL=https://your-app.vercel.app \
#   TELEGRAM_CHAT_ID=-100123 \
#   TELEGRAM_CHANNEL_ID=-100456 \
#   ./scripts/n8n-prepare.sh

set -eu

APP_URL="${APP_URL:?set APP_URL (no trailing slash)}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:?set TELEGRAM_CHAT_ID — the private ops chat}"
# The public content channel. Defaults to the ops chat so a misconfigured run
# posts somewhere private rather than to an audience.
TELEGRAM_CHANNEL_ID="${TELEGRAM_CHANNEL_ID:-$TELEGRAM_CHAT_ID}"

APP_URL="${APP_URL%/}"
SRC="$(cd "$(dirname "$0")/../infra/n8n/workflows" && pwd)"
OUT="$SRC/ready"
mkdir -p "$OUT"

for f in "$SRC"/W*.json; do
  name="$(basename "$f")"
  sed -e "s|__APP_URL__|$APP_URL|g" \
      -e "s|__TELEGRAM_CHAT_ID__|$TELEGRAM_CHAT_ID|g" \
      -e "s|__TELEGRAM_CHANNEL_ID__|$TELEGRAM_CHANNEL_ID|g" \
      "$f" > "$OUT/$name"
  # Read from stdin, not a path: Git Bash paths like /d/... confuse node on Windows.
  node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" < "$OUT/$name"     && echo "  ✅ $name"
done

if grep -rlq "__[A-Z_]*__" "$OUT"; then
  echo "  ❌ placeholders remain:"; grep -rohE "__[A-Z_]+__" "$OUT" | sort -u | sed 's/^/     /'; exit 1
fi

cat <<EOF

Ready to import: $OUT

In n8n, create two credentials first — the workflows reference them by name:
  1. "Steinheim automation secret"  → Header Auth
       Name:  x-automation-secret
       Value: <your AUTOMATION_SECRET>
  2. "Steinheim bot"                → Telegram API, your BotFather token

Then Import from File for each workflow and re-select both credentials once
(exported JSON carries credential names, never their ids or values).
EOF
