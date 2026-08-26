#!/bin/sh
# Keeps the Telegram webhook pointing at an address that answers.
#
# A quick tunnel is issued per run and can drop while its container keeps
# running. Telegram then holds a URL that returns 530 and every message is lost
# in silence: the bot looks broken, the stack looks healthy, and nothing in
# either place says why. That is exactly what happened, and it is the reason
# this exists.
#
# The loop is deliberately dumb. It asks Telegram what URL it holds, asks the
# tunnel what URL it has, and reconciles the two. It does not try to decide
# whether the tunnel is "really" down — a webhook error and a changed address
# both mean the same thing to a person waiting for a reply.
#
# With PUBLIC_URL set to a named tunnel's hostname this does nothing after the
# first check, because that hostname never changes. It earns its keep on quick
# tunnels, which is where the instability lives.

set -u

INTERVAL="${WATCHDOG_INTERVAL:-120}"
TUNNEL_CONTAINER="${TUNNEL_CONTAINER:-steinheim-quick-tunnel}"

log() { echo "[watchdog] $(date -u +%H:%M:%S) $*"; }

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_WEBHOOK_SECRET:-}" ]; then
    log "no Telegram credentials - nothing to watch"
    # Sleeping rather than exiting: a container that exits under
    # restart:unless-stopped churns, and an operator reading the log should see
    # a clear reason rather than a crash loop.
    while true; do sleep 3600; done
fi

api() { wget -qO- --timeout=20 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/$1" 2>/dev/null; }

# The address the tunnel is currently serving. PUBLIC_URL wins when set: a named
# tunnel is stable and needs no discovery.
current_public_url() {
    if [ -n "${PUBLIC_URL:-}" ]; then
        printf '%s' "${PUBLIC_URL%/}"
        return
    fi
    # Quick tunnels announce their hostname once, in their own log.
    docker logs "$TUNNEL_CONTAINER" 2>&1 \
        | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' \
        | tail -1
}

register() {
    url="$1"
    hook="${url}/api/public/telegram/webhook"
    result=$(api "setWebhook?url=$(printf '%s' "$hook" | sed 's|:|%3A|g; s|/|%2F|g')&secret_token=${TELEGRAM_WEBHOOK_SECRET}&allowed_updates=%5B%22message%22%2C%22callback_query%22%5D")
    case "$result" in
        *'"ok":true'*) log "registered on $url"; return 0 ;;
        *) log "could not register on $url: $result"; return 1 ;;
    esac
}

log "watching every ${INTERVAL}s"

while true; do
    public_url=$(current_public_url)

    if [ -z "$public_url" ]; then
        log "no public address yet"
        sleep "$INTERVAL"
        continue
    fi

    info=$(api "getWebhookInfo")
    registered=$(printf '%s' "$info" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
    last_error=$(printf '%s' "$info" | sed -n 's/.*"last_error_message":"\([^"]*\)".*/\1/p')

    expected="${public_url}/api/public/telegram/webhook"

    if [ "$registered" != "$expected" ]; then
        log "address changed - Telegram has ${registered:-none}"
        register "$public_url"
    elif [ -n "$last_error" ]; then
        # A recorded error can be stale, so the address is probed before acting:
        # re-registering an address that works would achieve nothing and hide a
        # different fault.
        if wget -q --spider --timeout=20 "${public_url}/auth" 2>/dev/null; then
            log "Telegram reported '${last_error}' but the address answers - leaving it"
        else
            log "address not answering (${last_error}) - re-registering"
            register "$public_url"
        fi
    fi

    sleep "$INTERVAL"
done
