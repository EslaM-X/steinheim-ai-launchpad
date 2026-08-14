import { z } from "zod";

export const CREATIVE_DIRECTIONS = [
  "luxury",
  "cinematic",
  "architectural",
  "emotional",
  "provocative",
  "minimal",
  "technical",
  "lifestyle",
] as const;
export type CreativeDirection = (typeof CREATIVE_DIRECTIONS)[number];

export const AUDIENCE_SEGMENTS = [
  { key: "interior_designers", label_en: "Interior Designers", label_ar: "مصممو الديكور" },
  { key: "contractors", label_en: "Contractors / Finishing", label_ar: "شركات التشطيبات" },
  { key: "developers", label_en: "Developers", label_ar: "المطورون العقاريون" },
  { key: "homeowners", label_en: "Luxury Homeowners", label_ar: "ملاك المنازل الفاخرة" },
  { key: "showrooms", label_en: "Showrooms / Distributors", label_ar: "المعارض والموزعون" },
  { key: "mass_premium", label_en: "Mass Premium", label_ar: "الجمهور المميز" },
] as const;

export const AD_VARIANT_PRESETS = [
  { key: "hero_30", platform: "youtube", aspect_ratio: "16:9", duration_seconds: 30 },
  { key: "reel_15", platform: "instagram", aspect_ratio: "9:16", duration_seconds: 15 },
  { key: "tiktok_15", platform: "tiktok", aspect_ratio: "9:16", duration_seconds: 15 },
  { key: "hook_10", platform: "instagram", aspect_ratio: "9:16", duration_seconds: 10 },
  { key: "bumper_6", platform: "youtube", aspect_ratio: "16:9", duration_seconds: 6 },
  { key: "story_15", platform: "facebook", aspect_ratio: "9:16", duration_seconds: 15 },
  { key: "feed_4x5", platform: "facebook", aspect_ratio: "4:5", duration_seconds: 20 },
  { key: "linkedin_b2b", platform: "linkedin", aspect_ratio: "1:1", duration_seconds: 30 },
] as const;

export const CREATIVE_MODES = ["mock", "local", "cloud", "hybrid"] as const;
export type CreativeMode = (typeof CREATIVE_MODES)[number];

export const conceptSchema = z.object({
  title: z.string(),
  big_idea: z.string(),
  hook: z.string(),
  script_ar: z.string(),
  script_en: z.string(),
  emotional_trigger: z.string(),
  visual_language: z.string(),
  why_it_works: z.string(),
});
export const conceptsSchema = z.object({ concepts: z.array(conceptSchema) });

export const creativeDnaSchema = z.object({
  hook: z.string(),
  visual_pattern: z.string(),
  camera: z.string(),
  lighting: z.string(),
  color: z.string(),
  editing: z.string(),
  sound: z.string(),
  emotional_trigger: z.string(),
  product_reveal: z.string(),
  cta: z.string(),
  improvement_notes: z.string(),
});

export const shotSchema = z.object({
  visual: z.string(),
  prompt: z.string(),
  camera: z.string(),
  lens: z.string(),
  lighting: z.string(),
  movement: z.string(),
  environment: z.string(),
  transition: z.string(),
  audio_note: z.string(),
  duration_seconds: z.number(),
  workflow: z.string(),
});
export const storyboardSchema = z.object({ shots: z.array(shotSchema) });

export const creativeReviewSchema = z.object({
  product_accuracy: z.number(),
  brand_accuracy: z.number(),
  visual_quality: z.number(),
  claim_accuracy: z.number(),
  cultural_fit: z.number(),
  platform_fit: z.number(),
  logo_integrity: z.number(),
  text_rendering: z.number(),
  audio_quality: z.number(),
  voice_pronunciation: z.number(),
  visual_continuity: z.number(),
  product_geometry: z.number(),
  luxury_score: z.number(),
  ai_artifact_score: z.number(),
  originality: z.number(),
  cta_quality: z.number(),
  hard_fail: z.boolean(),
  hard_fail_reasons: z.array(z.string()),
  notes: z.string(),
});

export type Concept = z.infer<typeof conceptSchema>;
export type CreativeDna = z.infer<typeof creativeDnaSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type CreativeReview = z.infer<typeof creativeReviewSchema>;
