import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string(),
        objective: z.string(),
        market: z.string(),
        language: z.string(),
        duration_seconds: z.number(),
        platforms: z.array(z.string()),
        directions: z.array(z.string()),
        product_id: z.string().uuid().nullable(),
        audience_segment: z.string().nullable(),
        budget_egp: z.number().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { creativeMode, creativeDirectorBrief } = await import("./creative/studio.server");
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({ ...data, mode: creativeMode(), created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const brief = await creativeDirectorBrief(supabase, campaign);
    await supabase.from("campaigns").update({ brief }).eq("id", campaign.id);
    return { ...campaign, brief };
  });

export const analyzeReferenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        kind: z.string(),
        source_url: z.string().nullable(),
        notes: z.string().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { analyzeCampaignReference } = await import("./creative/pipeline.server");
    return analyzeCampaignReference(context.supabase as never, data);
  });

export const generateConceptsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { buildConcepts } = await import("./creative/pipeline.server");
    return buildConcepts(context.supabase as never, data.campaignId);
  });

export const selectConceptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ conceptId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { selectConcept } = await import("./creative/pipeline.server");
    return selectConcept(context.supabase as never, data.conceptId);
  });

export const regenerateShotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ shotId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { regenerateShot } = await import("./creative/pipeline.server");
    return regenerateShot(context.supabase as never, data.shotId);
  });

export const creativeActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        action: z.enum(["cinematic", "egyptian", "global", "variants"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { applyCreativeAction } = await import("./creative/pipeline.server");
    return applyCreativeAction(context.supabase as never, data.campaignId, data.action);
  });

export const reviewCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { reviewCampaign } = await import("./creative/pipeline.server");
    return reviewCampaign(context.supabase as never, data.campaignId);
  });

export const approveCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campaignId: z.string().uuid(), approve: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { humanApproveCampaign } = await import("./creative/pipeline.server");
    return humanApproveCampaign(
      context.supabase as never,
      context.userId,
      data.campaignId,
      data.approve,
    );
  });
