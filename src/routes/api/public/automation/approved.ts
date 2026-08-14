import { createFileRoute } from "@tanstack/react-router";

/**
 * The publish queue, and the reconciliation queue beside it.
 *
 * `?claim=true` moves a row from `approved` to `publishing` in a conditional
 * update, so two n8n workers polling at once cannot both take the same post.
 * Without it the call is a read-only preview.
 *
 * A row stuck in `publishing` past STALE_CLAIM_MS is NOT handed back out. The
 * worker that claimed it died without reporting, so whether the post reached the
 * platform is unknown — re-publishing it is exactly how the same ad goes out
 * twice. It moves to `unknown` instead and waits for reconciliation.
 *
 * `?state=unknown` lists those rows so the reconciler can ask each platform what
 * actually happened, then report back through /published with
 * `outcome: "published"` or `outcome: "not_found"`.
 */

const STALE_CLAIM_MS = 15 * 60 * 1000;
const MAX_LIMIT = 50;

const COLUMNS =
  "id, platform, account_id, status, media_type, body_en, body_ar, hashtags, image_url, " +
  "scheduled_at, publish_attempts, last_publish_attempt_at, publish_idempotency_key, " +
  "reconcile_attempts, campaign_id, creative_asset_id, idea_id";

export const Route = createFileRoute("/api/public/automation/approved")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "approved", async ({ supabase, url }) => {
          const claim = url.searchParams.get("claim") === "true";
          const state = url.searchParams.get("state") ?? "queue";
          const limit = Math.min(Number(url.searchParams.get("limit") ?? 10) || 10, MAX_LIMIT);
          const channel = url.searchParams.get("channel");

          if (state !== "queue" && state !== "unknown") {
            return json({ error: "state must be 'queue' or 'unknown'" }, 422);
          }

          // Reconciliation queue: read-only by design. Nothing here may be
          // claimed for publishing until a platform confirms what happened.
          if (state === "unknown") {
            let unknownQuery = supabase
              .from("posts")
              .select(COLUMNS)
              .eq("is_test", false)
              .eq("status", "unknown")
              .order("last_publish_attempt_at", { ascending: true })
              .limit(limit);
            if (channel) unknownQuery = unknownQuery.eq("platform", channel);
            const { data, error } = await unknownQuery;
            if (error) return json({ error: error.message }, 500);
            const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
            return json({ count: rows.length, state: "unknown", posts: rows });
          }

          let query = supabase
            .from("posts")
            .select(COLUMNS)
            .eq("is_test", false)
            .in("status", ["approved", "publishing"])
            .not("human_approved_at", "is", null)
            .is("platform_post_id", null)
            .order("scheduled_at", { ascending: true, nullsFirst: true })
            .limit(limit);
          if (channel) query = query.eq("platform", channel);

          const { data, error } = await query;
          if (error) return json({ error: error.message }, 500);

          const now = Date.now();
          // The column list is a runtime string, so the typed client cannot infer a row shape.
          const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;

          const isStale = (row: Record<string, unknown>) =>
            row["status"] === "publishing" &&
            now - new Date(String(row["last_publish_attempt_at"] ?? 0)).getTime() > STALE_CLAIM_MS;

          if (!claim) {
            return json({
              count: rows.length,
              posts: rows.filter((row) => row["status"] === "approved"),
              stale: rows.filter(isStale).length,
            });
          }

          const claimed: Array<Record<string, unknown>> = [];
          const quarantined: string[] = [];

          for (const row of rows) {
            const id = row["id"] as string;

            if (isStale(row)) {
              // Conditional on `publishing`: if the original worker has since
              // reported in, it wins and this becomes a no-op.
              const { data: moved } = await supabase
                .from("posts")
                .update({
                  status: "unknown",
                  publish_error: "Worker claimed this post and never reported an outcome",
                })
                .eq("id", id)
                .eq("status", "publishing")
                .is("platform_post_id", null)
                .select("id")
                .maybeSingle();
              if (moved) quarantined.push(id);
              continue;
            }

            if (row["status"] !== "approved") continue;

            const { data: updated } = await supabase
              .from("posts")
              .update({
                status: "publishing",
                last_publish_attempt_at: new Date().toISOString(),
                publish_attempts: (Number(row["publish_attempts"]) || 0) + 1,
              })
              .eq("id", id)
              .eq("status", "approved")
              .select(COLUMNS)
              .maybeSingle();
            if (updated) claimed.push(updated as unknown as Record<string, unknown>);
          }

          return json({
            count: claimed.length,
            claimed: true,
            posts: claimed,
            // Surfaced rather than silent: these need reconciliation, not a retry.
            movedToUnknown: quarantined,
          });
        });
      },
    },
  },
});
