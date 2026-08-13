import { z } from "zod";

export const strategySchema = z.object({
  topic_en: z.string(),
  topic_ar: z.string(),
  goal: z.enum(["sales", "awareness", "brand"]),
  angle: z.string(),
  product_sku: z.string().nullish().transform((v) => v ?? null),
  audience_name: z.string().nullish().transform((v) => v ?? null),
});

export const copySchema = z.object({
  linkedin_en: z.string(),
  linkedin_ar: z.string(),
  facebook_en: z.string(),
  facebook_ar: z.string(),
  instagram_en: z.string(),
  instagram_ar: z.string(),
  hashtags: z.array(z.string()),
  image_prompt: z.string(),
});

export const reviewSchema = z.object({
  score: z.number(),
  notes: z.string(),
});

export type Strategy = z.infer<typeof strategySchema>;
export type Copy = z.infer<typeof copySchema>;
