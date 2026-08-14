import { createFileRoute } from "@tanstack/react-router";

import { analyticsSchema } from "@/lib/automation/schemas";

/**
 * Ingests a metrics snapshot for a published post.
 *
 * The collector is not trusted to say which post it measured: the triple
 * (postId, platform, platformPostId) must match what the database already
 * recorded at publish time, otherwise numbers from one channel could be written
 * onto another channel's post. Snapshots upsert on (post_id, measured_on), so
 * re-running the +24h/+48h/+72h collection corrects a row instead of stacking
 * duplicates.
 */

export const Route = createFileRoute("/api/public/automation/analytics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "analytics", async ({ supabase, body }) => {
          const parsed = analyticsSchema.safeParse(body);
          if (!parsed.success) {
            return json({ error: "Invalid payload", issues: parsed.error.issues }, 422);
          }
          const input = parsed.data;

          const { data: post, error: readError } = await supabase
            .from("posts")
            .select("id, platform, platform_post_id, status")
            .eq("id", input.postId)
            .maybeSingle();
          if (readError) return json({ error: readError.message }, 500);
          if (!post) return json({ error: "Unknown postId" }, 404);

          if (post.platform !== input.platform || post.platform_post_id !== input.platformPostId) {
            return json(
              {
                error:
                  "postId, platform and platformPostId do not identify the same published post",
              },
              409,
            );
          }
          if (post.status !== "published") {
            return json({ error: `Post is ${post.status}, not published` }, 409);
          }

          const measuredOn = input.measuredOn ?? new Date().toISOString().slice(0, 10);
          const { error } = await supabase.from("post_analytics").upsert(
            {
              post_id: input.postId,
              platform: input.platform,
              platform_post_id: input.platformPostId,
              measured_on: measuredOn,
              captured_at: new Date().toISOString(),
              raw_metrics: (input.raw ?? {}) as never,
              ...input.metrics,
            },
            { onConflict: "post_id,measured_on" },
          );
          if (error) return json({ error: error.message }, 500);

          return json({ ok: true, postId: input.postId, measuredOn });
        });
      },
    },
  },
});
