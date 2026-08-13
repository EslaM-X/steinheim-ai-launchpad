import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateToday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { generateTodayPipeline } = await import("./agents.pipeline");
    return generateTodayPipeline(context.supabase as never, context.userId);
  });

export const regeneratePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { regeneratePostCopy } = await import("./agents.actions");
    return regeneratePostCopy(context.supabase as never, data.postId);
  });

export const reviewPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { reviewSinglePost } = await import("./agents.actions");
    return reviewSinglePost(context.supabase as never, data.postId);
  });

export const generatePostImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { generateImageForPost } = await import("./agents.actions");
    return generateImageForPost(context.supabase as never, data.postId);
  });

export const summarizePerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runAnalyticsAgent } = await import("./agents.actions");
    return runAnalyticsAgent(context.supabase as never);
  });
