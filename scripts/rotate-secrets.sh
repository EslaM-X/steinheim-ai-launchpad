#!/usr/bin/env bash
# Generates the secrets Steinheim invents for itself and writes them straight
# into .env.golive.
#
#   ./scripts/rotate-secrets.sh
#
# It never prints a value. A secret that appears on a screen can be copied into
# a chat, a screenshot or a support ticket — the safest secret is one nobody has
# ever read, including you.
#
# Run it again any time a value may have been exposed. Rotation is cheap;
# these three are only shared between this repository, Vercel and n8n.

set -euo pipefail
cd "$(dirname "$0")/.."

TARGET=".env.golive"
KEYS=(AUTOMATION_SECRET CREATIVE_WORKER_SECRET TELEGRAM_WEBHOOK_SECRET)

if [ ! -f "$TARGET" ]; then
  cp .env.golive.example "$TARGET"
  echo "Created $TARGET from the template."
fi

# Refuse to write anywhere git can see. The file is gitignored, but a repo
# misconfiguration must not become a leak.
if git check-ignore -q "$TARGET"; then
  :
else
  echo "❌ $TARGET is not gitignored — refusing to write secrets into a tracked file."
  exit 1
fi

for key in "${KEYS[@]}"; do
  value=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
  if grep -q "^${key}=" "$TARGET"; then
    # Portable in-place edit: BSD and GNU sed disagree about -i.
    node -e "
      const fs = require('fs');
      const [file, k, v] = process.argv.slice(1);
      const out = fs.readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((line) => (line.startsWith(k + '=') ? k + '=' + v : line))
        .join('\n');
      fs.writeFileSync(file, out);
    " "$TARGET" "$key" "$value"
  else
    printf '%s=%s\n' "$key" "$value" >> "$TARGET"
  fi
  unset value
  echo "  ✅ $key rotated (64 hex characters)"
done

cat <<'EOF'

Written to .env.golive. Nothing was displayed.

Wherever these already exist, replace them from that file — never by retyping:
  • Vercel environment variables (server scope only)
  • the n8n "Steinheim automation secret" credential
  • the Telegram webhook, which go-live.sh re-registers for you

Still to fill in by hand, because each one comes from a page only you can open:
  SUPABASE_ACCESS_TOKEN   supabase.com/dashboard/account/tokens
  SUPABASE_PROJECT_REF    Project Settings → General → Project ID
  SUPABASE_DB_PASSWORD    the database password (reset it if it was ever shared)
  SUPABASE_URL / keys     Project Settings → API
  AI_API_KEY              openrouter.ai → Keys
  TELEGRAM_BOT_TOKEN      @BotFather
  SUPABASE_APPROVER_USER_ID / TELEGRAM_APPROVER_USER_ID
EOF
