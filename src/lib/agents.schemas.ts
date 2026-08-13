import { z } from "zod";

export const CONTENT_TYPES = [
  "product_spotlight",
  "design_insight",
  "specification_tip",
  "project_showcase",
  "comparison",
  "problem_solution",
  "material_finish_guide",
  "installation_insight",
  "brand_story",
  "case_study",
  "trade_education",
  "seasonal_campaign",
] as const;

export const CONTENT_FORMATS = [
  "educational_post",
  "storytelling_post",
  "carousel_concept",
  "single_image_post",
  "listicle",
  "before_after",
  "question_post",
] as const;

export const FUNNEL_STAGES = ["top_of_funnel", "middle_of_funnel", "bottom_of_funnel"] as const;

export const PLATFORMS = ["linkedin", "facebook", "instagram"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const strategySchema = z.object({
  topic_en: z.string(),
  topic_ar: z.string(),
  content_type: z.enum(CONTENT_TYPES),
  content_format: z.enum(CONTENT_FORMATS),
  funnel_stage: z.enum(FUNNEL_STAGES),
  goal: z.enum(["sales", "awareness", "brand"]),
  angle: z.string(),
  big_idea: z.string(),
  why_now: z.string(),
  product_sku: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  audience_name: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
});

/** Research output: every technical claim must be traceable to knowledge-base data. */
export const researchSchema = z.object({
  summary: z.string(),
  claims: z.array(
    z.object({
      claim: z.string(),
      source_type: z.enum(["product", "project", "audience", "brand", "general_design_principle"]),
      source_id: z
        .string()
        .nullish()
        .transform((v) => v ?? null),
      source_confidence: z.enum(["high", "medium", "low"]),
      verified: z.boolean(),
    }),
  ),
  objection_to_answer: z.string(),
  recommended_cta: z.string(),
});

export const platformStrategySchema = z.object({
  linkedin_direction: z.string(),
  facebook_direction: z.string(),
  instagram_direction: z.string(),
});

export const platformCopySchema = z.object({
  body_en: z.string(),
  body_ar: z.string(),
  hashtags: z.array(z.string()),
});

export const imagePromptSchema = z.object({
  prompt: z.string(),
  product_geometry: z.string(),
  finish: z.string(),
  mounting_configuration: z.string(),
  forbidden_modifications: z.array(z.string()),
});

export const accuracySchema = z.object({
  passed: z.boolean(),
  unverified_claims: z.array(z.string()),
  wrong_facts: z.array(z.string()),
  notes: z.string(),
});

export const reviewSchema = z.object({
  brand_alignment: z.number(),
  product_accuracy: z.number(),
  platform_fit: z.number(),
  strategic_value: z.number(),
  audience_relevance: z.number(),
  originality: z.number(),
  cta_quality: z.number(),
  language_quality: z.number(),
  visual_potential: z.number(),
  score: z.number(),
  hard_fail: z.boolean(),
  hard_fail_reasons: z.array(z.string()),
  platform_differentiation: z.string(),
  notes: z.string(),
  per_platform_notes: z.object({
    linkedin: z.string(),
    facebook: z.string(),
    instagram: z.string(),
  }),
});

export type Strategy = z.infer<typeof strategySchema>;
export type Research = z.infer<typeof researchSchema>;
export type PlatformCopy = z.infer<typeof platformCopySchema>;
export type ImagePrompt = z.infer<typeof imagePromptSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type AccuracyReport = z.infer<typeof accuracySchema>;
