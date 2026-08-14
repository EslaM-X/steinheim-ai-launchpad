import { z } from "zod";

/**
 * Request contracts for the automation API. Strict on purpose: an unknown key
 * is a caller bug, and silently accepting it is how a typo becomes a metric
 * that never gets written.
 */

export const channelSchema = z.enum(["linkedin", "facebook", "instagram", "tiktok", "telegram"]);

const metric = z.number().int().min(0).max(2_000_000_000);
const rate = z.number().min(0).max(1);

/**
 * Publish outcomes.
 *
 * `unknown` is the important one: the attempt got no definitive answer, so the
 * post must not be retried until reconciliation establishes whether it went out.
 * `not_found` is reconciliation reporting the platform has no such post, which
 * is the only safe route back to the queue.
 */
export const publishOutcomes = ["published", "failed", "unknown", "not_found"] as const;
export type PublishOutcome = (typeof publishOutcomes)[number];

export const publishedSchema = z
  .object({
    postId: z.string().uuid(),
    platform: channelSchema,
    /** Omit for the plain cases: platformPostId implies success, error implies failure. */
    outcome: z.enum(publishOutcomes).optional(),
    platformPostId: z.string().min(1).max(255).optional(),
    publishedUrl: z.string().url().max(2000).optional(),
    publishedAt: z.string().datetime().optional(),
    error: z.string().min(1).max(1000).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const outcome =
      value.outcome ?? (value.platformPostId ? "published" : value.error ? "failed" : undefined);
    if (!outcome) {
      ctx.addIssue({
        code: "custom",
        message: "Provide an outcome, or platformPostId (success) / error (failure)",
      });
      return;
    }
    if (outcome === "published" && !value.platformPostId) {
      ctx.addIssue({ code: "custom", message: "outcome 'published' requires platformPostId" });
    }
    if (outcome === "failed" && !value.error) {
      ctx.addIssue({ code: "custom", message: "outcome 'failed' requires error" });
    }
    if (outcome !== "published" && value.platformPostId) {
      ctx.addIssue({
        code: "custom",
        message: `outcome '${outcome}' must not carry platformPostId — a known id means it published`,
      });
    }
  });

/** Resolves the implied outcome so handlers never re-derive it. */
export function resolveOutcome(value: z.infer<typeof publishedSchema>): PublishOutcome {
  return value.outcome ?? (value.platformPostId ? "published" : "failed");
}

export const analyticsSchema = z
  .object({
    postId: z.string().uuid(),
    platform: channelSchema,
    platformPostId: z.string().min(1).max(255),
    measuredOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "measuredOn must be YYYY-MM-DD")
      .optional(),
    metrics: z
      .object({
        impressions: metric.optional(),
        reach: metric.optional(),
        engagements: metric.optional(),
        likes: metric.optional(),
        comments: metric.optional(),
        shares: metric.optional(),
        saves: metric.optional(),
        clicks: metric.optional(),
        leads: metric.optional(),
        video_views: metric.optional(),
        watch_time_seconds: metric.optional(),
        followers_gained: metric.optional(),
        profile_visits: metric.optional(),
        link_clicks: metric.optional(),
        completion_rate: rate.optional(),
        engagement_rate: rate.optional(),
      })
      .strict(),
    /** Anything the platform reports that no other one does. */
    raw: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type PublishedInput = z.infer<typeof publishedSchema>;
export type AnalyticsInput = z.infer<typeof analyticsSchema>;
