#!/usr/bin/env bash
# Deploys the workflow templates into the self-hosted n8n container.
#
#   APP_URL=http://localhost:3000 \
#   TELEGRAM_CHAT_ID=-100123 \
#   ./scripts/n8n-prepare.sh && ./scripts/n8n-import.sh
#
# What it does: n8n-prepare fills the placeholders, this copies the ready
# workflows into the running container and imports them. Without it, an edited
# W*.json in git and the workflow actually scheduled in n8n drift apart
# silently — the file looks done while production still runs last month's copy.
#
# Requires: docker compose stack from infra/selfhost up (the n8n service).

set -eu

# Git Bash rewrites any argument that looks like a Unix path into a Windows one
# before the process sees it, so a container path becomes C:/Users/.../tmp/... and
# the import fails with ENOENT on a file the container never had. Harmless
# everywhere else.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*' 

cd "$(dirname "$0")/.."

READY="infra/n8n/workflows/ready"
ENV_FILE=".env"

if [ ! -d "$READY" ] || ! ls "$READY"/W*.json >/dev/null 2>&1; then
  echo "❌ no ready workflows — run scripts/n8n-prepare.sh first"; exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE not found — create it from .env.selfhost.example at the repo root"; exit 1
fi

compose() { docker compose --env-file "$ENV_FILE" -f infra/selfhost/docker-compose.yml "$@"; }

if [ -z "$(compose ps -q n8n)" ]; then
  echo "❌ n8n container is not running:"; echo "   docker compose --env-file $ENV_FILE -f infra/selfhost/docker-compose.yml up -d n8n"; exit 1
fi

for f in "$READY"/W*.json; do
  name="$(basename "$f")"
  compose cp "$f" "n8n:/tmp/$name"
  compose exec -T n8n n8n import:workflow --input="/tmp/$name"

  # Importing leaves a workflow inactive, whatever it was before. Left there,
  # the file looks deployed and nothing is scheduled - the exact silent drift
  # this script exists to prevent. The id comes from the template, which is why
  # the templates carry stable ones.
  wf_id=$(sed -n 's/.*"id": *"\([^"]*\)".*//p' "$f" | head -1)
  if [ -n "$wf_id" ]; then
    compose exec -T n8n n8n publish:workflow --id="$wf_id" >/dev/null 2>&1       && echo "  ✅ $name imported and activated"       || echo "  ⚠️  $name imported but NOT activated - enable it in the n8n UI"
  else
    echo "  ⚠️  $name imported but has no id - cannot activate automatically"
  fi
done

cat <<'EOF'

Imported. Two things n8n cannot do for you:

  1. Re-importing creates a NEW workflow, it does not update the old one.
     Delete the stale copy in the n8n UI, or deactivate it first, so two
     schedulers never fire at once.
  2. Exported JSON carries credential NAMES, never ids — open each imported
     workflow once and re-select both credentials ("Steinheim automation
     secret" and "Steinheim bot").

Then activate each workflow in the UI (or: n8n update:workflow --all --active=true).
EOF
