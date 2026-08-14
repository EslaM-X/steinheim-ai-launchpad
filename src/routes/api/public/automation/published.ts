import { createFileRoute } from "@tanstack/react-router";

import { publishedSchema, resolveOutcome } from "@/lib/automation/schemas";

/**
 * Records the outcome of a publish attempt, and is the only way a post leaves
 * the `publishing` state.
 *
 *   publishing ──┬── platformPostId ──────► published
 *                ├── error (definitive) ──► failed
 *                └── outcome: unknown ────► unknown ──► reconciliation
 *
 * A caller that lost its answer must report `unknown`, never `failed`: `failed`
 * asserts the post did not go out, and asserting that wrongly is what publishes
 * the same ad twice. Only `outcome: "not_found"` — reconciliation confirming the
 * platform has no such post — puts it back in the queue.
 */
export const Route = createFileRoute("/api/public/automation/published")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { withAutomationGuard, json } = await import("@/lib/automation/guard.server");

        return withAutomationGuard(request, "published", async ({ supabase, body }) => {
          const parsed = publishedSchema.safeParse(body);
          if (!parsed.success) {
            return json({ error: "Invalid payload", issues: parsed.error.issues }, 422);
          }
          const input = parsed.data;
          const outcome = resolveOutcome(input);

          const { data: post, error: readError } = await supabase
            .from("posts")
            .select(
              "id, platform, status, platform_post_id, published_url, reconcile_attempts, publish_attempts",
            )
            .eq("id", input.postId)
            .maybeSingle();
          if (readError) return json({ error: readError.message }, 500);
          if (!post) return json({ error: "Unknown postId" }, 404);
          if (post.platform !== input.platform) {
            return json(
              { error: `Post ${input.postId} is a ${post.platform} post, not ${input.platform}` },
              409,
            );
          }

          // Already confirmed on the platform: nothing may overwrite that.
          if (post.platform_post_id) {
            if (outcome === "published") {
              return json({
                ok: true,
                postId: input.postId,
                status: "published",
                platformPostId: post.platform_post_id,
                publishedUrl: post.published_url,
                alreadyRecorded: post.platform_post_id === input.platformPostId,
              });
            }
            return json(
              {
                error: `Post already published as ${post.platform_post_id}; '${outcome}' cannot apply`,
                status: "published",
              },
              409,
            );
          }

          if (outcome === "published") {
            const { error } = await supabase
              .from("posts")
              .update({
                status: "published",
                platform_post_id: input.platformPostId,
                published_url: input.publishedUrl ?? null,
                published_at: input.publishedAt ?? new Date().toISOString(),
                publish_error: null,
                publish_idempotency_key: input.idempotencyKey ?? null,
              })
              .eq("id", input.postId)
              .is("platform_post_id", null);
            if (error) {
              // 23505 = this platform_post_id is already recorded elsewhere.
              if (error.code === "23505") {
                return json(
                  { error: "This platform_post_id is already recorded on another post" },
                  409,
                );
              }
              return json({ error: error.message }, 500);
            }
            return json({ ok: true, postId: input.postId, status: "published" });
          }

          if (outcome === "failed") {
            const { error } = await supabase
              .from("posts")
              .update({ status: "failed", publish_error: input.error })
              .eq("id", input.postId);
            if (error) return json({ error: error.message }, 500);
            return json({ ok: true, postId: input.postId, status: "failed" });
          }

          if (outcome === "unknown") {
            const { error } = await supabase
              .from("posts")
              .update({
                status: "unknown",
                publish_error: input.error ?? "No confirmation from the platform",
                publish_idempotency_key: input.idempotencyKey ?? null,
              })
              .eq("id", input.postId);
            if (error) return json({ error: error.message }, 500);
            return json({
              ok: true,
              postId: input.postId,
              status: "unknown",
              next: "reconcile against the platform before any retry",
            });
          }

          // not_found — reconciliation says the platform has no such post.
          if (post.status !== "unknown") {
            return json(
              {
                error: `'not_found' only applies to a post in 'unknown'; this one is '${post.status}'`,
              },
              409,
            );
          }
          const { error } = await supabase
            .from("posts")
            .update({
              status: "approved",
              reconcile_attempts: (post.reconcile_attempts ?? 0) + 1,
              last_reconciled_at: new Date().toISOString(),
              publish_error: null,
              // A fresh attempt must carry a fresh key.
              publish_idempotency_key: null,
            })
            .eq("id", input.postId)
            .eq("status", "unknown");
          if (error) return json({ error: error.message }, 500);

          return json({ ok: true, postId: input.postId, status: "approved", safeToRetry: true });
        });
      },
    },
  },
});
