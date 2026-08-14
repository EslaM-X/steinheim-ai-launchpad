import { createFileRoute } from "@tanstack/react-router";

/**
 * Telegram webhook.
 *
 * Authenticated with the secret token Telegram echoes back on every call
 * (`setWebhook?secret_token=…`), compared in constant time — not with the
 * automation secret, because Telegram is the caller here, not n8n.
 *
 * Always answers 200 once the caller is verified: a non-2xx makes Telegram
 * retry the same update, which would replay approval clicks.
 */
export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["TELEGRAM_WEBHOOK_SECRET"];
        if (!expected) return new Response("Telegram channel not configured", { status: 503 });

        const provided = request.headers.get("x-telegram-bot-api-secret-token");
        const { secretMatches } = await import("@/lib/automation/guard.server");
        if (!provided || !(await secretMatches(provided, expected))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!update) return Response.json({ ok: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { handleTelegramUpdate } = await import("@/lib/automation/telegram.server");

        try {
          await handleTelegramUpdate(supabaseAdmin as never, update);
        } catch (error) {
          // Swallow after logging: retrying this update would re-run the click.
          console.error("[telegram] update handling failed", error);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
