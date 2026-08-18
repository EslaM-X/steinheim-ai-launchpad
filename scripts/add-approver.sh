#!/usr/bin/env bash
# Authorise a person to approve publishing from Telegram.
#
#   ./scripts/add-approver.sh <email> <telegram-user-id>
#   ./scripts/add-approver.sh --list
#   ./scripts/add-approver.sh --remove <telegram-user-id>
#
# Reads credentials from .env.golive. The person must have signed in to the app
# at least once — an approval names a real account, and this script refuses to
# invent one.

set -uo pipefail
cd "$(dirname "$0")/.."

[ -f .env.golive ] || { echo "❌ .env.golive not found"; exit 1; }
set -a; . ./.env.golive; set +a

REST="${SUPABASE_URL%/}/rest/v1"
AUTH=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

jnode() { node -e "
let d='';
process.stdin.on('data', c => d += c).on('end', () => {
  try { const j = JSON.parse(d); console.log(eval(process.argv[1]) ?? ''); } catch (e) { console.log(''); }
});" "$1"; }

current_approvers() {
  curl -s "$REST/integrations?kind=eq.telegram&name=eq.command-centre&select=config" "${AUTH[@]}" \
    | jnode "JSON.stringify(j[0] ? (j[0].config.approvers || {}) : {})"
}

write_approvers() {
  curl -s -X PATCH "$REST/integrations?kind=eq.telegram&name=eq.command-centre" "${AUTH[@]}" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    -d "{\"config\":{\"approvers\":$1},\"status\":\"active\"}" -o /dev/null -w '%{http_code}'
}

if [ "${1:-}" = "--list" ]; then
  echo "Approvers who may approve publishing from Telegram:"
  MAP=$(current_approvers)
  echo "$MAP" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  const m = JSON.parse(d || '{}');
  const e = Object.entries(m);
  if (!e.length) return console.log('  (none)');
  for (const [tg, uuid] of e) console.log('  telegram ' + tg + '  →  ' + uuid);
});"
  exit 0
fi

if [ "${1:-}" = "--remove" ]; then
  TG="${2:?usage: --remove <telegram-user-id>}"
  MAP=$(current_approvers)
  NEXT=$(echo "$MAP" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  const m = JSON.parse(d || '{}'); delete m[process.argv[1]]; console.log(JSON.stringify(m));
});" "$TG")
  CODE=$(write_approvers "$NEXT")
  [ "$CODE" = "200" ] && echo "✅ removed telegram $TG" || echo "❌ update failed (HTTP $CODE)"
  exit 0
fi

EMAIL="${1:?usage: ./scripts/add-approver.sh <email> <telegram-user-id>}"
TG="${2:?usage: ./scripts/add-approver.sh <email> <telegram-user-id>}"

case "$TG" in (*[!0-9]*|"") echo "❌ telegram user id must be numeric"; exit 1;; esac

# The uuid is looked up from the account, never supplied by hand — a typo would
# attribute someone's publishing decisions to a different person.
UUID=$(curl -s "$REST/rpc/noop" -o /dev/null 2>/dev/null; \
  curl -s "$REST/profiles?select=id,display_name" "${AUTH[@]}" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.stringify(JSON.parse(d))); } catch { console.log('[]'); } });")

# profiles carries no email, so resolve through the auth admin API.
FOUND=$(curl -s "${SUPABASE_URL%/}/auth/v1/admin/users?page=1&per_page=200" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  try {
    const users = (JSON.parse(d).users) || [];
    const u = users.find(x => (x.email || '').toLowerCase() === process.argv[1].toLowerCase());
    console.log(u ? u.id : '');
  } catch { console.log(''); }
});" "$EMAIL")

if [ -z "$FOUND" ]; then
  echo "❌ no account for $EMAIL"
  echo "   They must sign in to the app once first. Existing accounts:"
  echo "$UUID" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  for (const p of JSON.parse(d || '[]')) console.log('     ' + p.id + '  ' + (p.display_name || '—'));
});"
  exit 1
fi

MAP=$(current_approvers)
NEXT=$(echo "$MAP" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  const m = JSON.parse(d || '{}'); m[process.argv[1]] = process.argv[2]; console.log(JSON.stringify(m));
});" "$TG" "$FOUND")

CODE=$(write_approvers "$NEXT")
if [ "$CODE" = "200" ]; then
  echo "✅ telegram $TG  →  $EMAIL  ($FOUND)"
  echo "   They can now approve from the chat. Ask them to send /help to the bot."
else
  echo "❌ update failed (HTTP $CODE)"
  exit 1
fi
