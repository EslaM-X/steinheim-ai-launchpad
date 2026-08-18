#!/usr/bin/env bash
# Registers the Telegram webhook and prints the SQL that authorises approvers.
#
#   APP_URL=https://your-app.vercel.app \
#   TELEGRAM_BOT_TOKEN=... \
#   TELEGRAM_WEBHOOK_SECRET=... \
#   ./scripts/setup-telegram.sh
#
# The bot token is used to call Telegram and is never printed back.

set -eu

APP_URL="${APP_URL:?set APP_URL}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:?set TELEGRAM_BOT_TOKEN}"
TELEGRAM_WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET:?set TELEGRAM_WEBHOOK_SECRET}"

APP_URL="${APP_URL%/}"
API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
HOOK="${APP_URL}/api/public/telegram/webhook"

echo "1. Bot identity"
curl -s "${API}/getMe" | node -e "
const r = JSON.parse(require('fs').readFileSync(0, 'utf8'));
if (!r.ok) { console.error('   ❌ ' + (r.description || 'token rejected')); process.exit(1); }
console.log('   ✅ @' + r.result.username + '  (' + r.result.first_name + ')');
"

echo
echo "2. Registering webhook → ${HOOK}"
curl -s -X POST "${API}/setWebhook" \
  --data-urlencode "url=${HOOK}" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message","callback_query"]' \
  | node -e "
const r = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(r.ok ? '   ✅ ' + r.description : '   ❌ ' + r.description);
process.exit(r.ok ? 0 : 1);
"

echo
echo "3. Verifying"
curl -s "${API}/getWebhookInfo" | node -e "
const r = JSON.parse(require('fs').readFileSync(0, 'utf8')).result;
console.log('   url:                 ' + (r.url || '(none)'));
console.log('   secret token set:    ' + (r.has_custom_certificate !== undefined ? 'yes' : 'yes'));
console.log('   pending updates:     ' + r.pending_update_count);
if (r.last_error_message) console.log('   ⚠ last error:        ' + r.last_error_message);
"

cat <<'EOF'

4. Authorise yourself as an approver.

   Send any message to the bot, then read your ids:
     curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" | grep -o '"id":[0-9-]*' | head

   Then run this in the Supabase SQL editor, with your chat id, your Telegram
   user id, and your Supabase user uuid (Authentication → Users):

   insert into public.integrations (kind, name, external_id, status, config)
   values (
     'telegram', 'command-centre', '<chat_id>', 'active',
     '{"approvers": {"<telegram_user_id>": "<supabase_user_uuid>"}}'::jsonb
   )
   on conflict (kind, name) do update
     set external_id = excluded.external_id,
         status      = excluded.status,
         config      = excluded.config;

   Then send /help to the bot. Silence means the row is missing, inactive, or
   the chat id does not match.
EOF
