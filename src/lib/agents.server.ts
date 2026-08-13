import { NoObjectGeneratedError, Output, streamText } from "ai";
import type { z } from "zod";

import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export const MODEL = "google/gemini-3.6-flash";

export function getApiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

export function getModel() {
  const gateway = createLovableAiGatewayProvider(getApiKey(), undefined, { structuredOutputs: true });
  return gateway(MODEL);
}

/** Structured generation over a streaming request (safe for long calls). */
export async function genObject<T extends z.ZodType>(args: {
  schema: T;
  system: string;
  prompt: string;
}): Promise<z.infer<T>> {
  try {
    const result = streamText({
      model: getModel(),
      system: args.system,
      prompt: args.prompt,
      output: Output.object({ schema: args.schema }),
    });
    return (await result.output) as z.infer<T>;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error) && error.text) {
      const match = error.text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return args.schema.parse(JSON.parse(match[0])) as z.infer<T>;
        } catch {
          /* fall through */
        }
      }
    }
    throw error;
  }
}

export async function genText(args: { system: string; prompt: string }) {
  const result = streamText({
    model: getModel(),
    system: args.system,
    prompt: args.prompt,
  });
  return await result.text;
}

type Brand = {
  brand_name: string;
  tagline: string | null;
  positioning: string | null;
  brand_story?: string | null;
  mission?: string | null;
  vision?: string | null;
  tone_of_voice: string | null;
  values_list?: string[];
  vocabulary_use?: string[];
  vocabulary_avoid?: string[];
  brand_promises?: string[];
  approved_ctas?: string[];
  competitive_positioning?: string | null;
  key_messages: string[];
  forbidden: string[];
  website: string | null;
};

export function brandSystemPrompt(brand: Brand | null) {
  if (!brand) return "You are a marketing agent for Steinheim, a premium bathroom brand in Egypt.";
  const list = (v?: string[]) => (v && v.length ? v.join(" | ") : "—");
  return [
    `You work for ${brand.brand_name} — ${brand.tagline ?? ""}.`,
    `Positioning: ${brand.positioning ?? ""}`,
    brand.brand_story ? `Brand story: ${brand.brand_story}` : "",
    brand.mission ? `Mission: ${brand.mission}` : "",
    brand.competitive_positioning ? `Competitive positioning: ${brand.competitive_positioning}` : "",
    `Tone of voice: ${brand.tone_of_voice ?? ""}`,
    `Values: ${list(brand.values_list)}`,
    `Key messages: ${list(brand.key_messages)}`,
    `Brand promises: ${list(brand.brand_promises)}`,
    `Vocabulary to use: ${list(brand.vocabulary_use)}`,
    `Vocabulary to avoid (never write these): ${list(brand.vocabulary_avoid)}`,
    `Approved CTAs (use one of these, adapted): ${list(brand.approved_ctas)}`,
    `Absolute brand rules: ${list(brand.forbidden)}`,
    `Website: ${brand.website ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Tiered source model — the AI may only turn Tier 1-2 material into factual claims. */
export const SOURCE_HIERARCHY = [
  "SOURCE HIERARCHY:",
  "- Tier 1 (official): Steinheim product documentation, catalogue, official website, technical sheets. Usable as fact.",
  "- Tier 2 (internal verified): approved internal documents, verified project records, approved specification material. Usable as fact.",
  "- Tier 3 (external): architecture publications, industry reports, market research. Usable as context only, never as a Steinheim product fact.",
  "- Tier 4 (AI inference): your own reasoning. NEVER usable as a factual claim — only as a content angle or a general design principle.",
].join("\n");

export function knowledgeBlock(input: {
  products: Array<Record<string, unknown>>;
  audiences: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  recentTopics: string[];
}) {
  return [
    "PRODUCTS (Truth Layer):",
    JSON.stringify(input.products),
    "AUDIENCES (Truth Layer):",
    JSON.stringify(input.audiences),
    "PROJECT REFERENCES (Truth Layer):",
    JSON.stringify(input.projects),
    "RECENTLY USED TOPICS (do not repeat):",
    input.recentTopics.join(" | ") || "none",
  ].join("\n");
}

/** The claim registry is the single source of truth for anything factual. */
export function claimsBlock(
  claims: Array<{ id: string; claim_text: string; entity_label: string | null; source_tier: number; approved_for: string[] }>,
  platform?: string,
) {
  const usable = platform
    ? claims.filter((c) => c.approved_for.length === 0 || c.approved_for.includes(platform))
    : claims;
  if (!usable.length) return "CLAIM REGISTRY: empty — you may not state any factual claim.";
  return [
    `CLAIM REGISTRY — the ONLY statements you may present as fact${platform ? ` on ${platform}` : ""}:`,
    ...usable.map((c) => `- [${c.id}] (tier ${c.source_tier}) ${c.claim_text}`),
  ].join("\n");
}

export function audienceBlock(audience: Record<string, unknown> | null) {
  if (!audience) return "TARGET AUDIENCE: general Steinheim audience in Egypt.";
  return ["TARGET AUDIENCE (Truth Layer — write for this person only):", JSON.stringify(audience)].join("\n");
}

/** Hard rules every writing agent inherits: no invented facts, ever. */
export const FACT_DISCIPLINE = [
  "FACT DISCIPLINE (absolute):",
  "- The Claim Registry and the supplied product data are the ONLY sources of fact. If a statement is not there, you may not make it.",
  "- Never write 'likely', 'probably', 'seems', 'German engineering', or any hedged fact. A hedged fact is still an invented fact.",
  "- Never invent specifications, cartridges, flow rates, certifications, warranties, dimensions, prices, clients or awards.",
  "- Never use a SKU or product number that is not in the supplied product data.",
  "- Never state anything listed in forbidden_claims or in the brand's absolute rules.",
  "- If a fact is not available, write around it with a design idea instead of guessing.",
  SOURCE_HIERARCHY,
].join("\n");

export const PLATFORM_RULES: Record<string, string> = {
  linkedin: [
    "LINKEDIN — thought leadership for specifiers (architects, designers, developers).",
    "Structure: Insight → Explanation → Product as proof → CTA.",
    "Open with an idea worth stopping for, NOT with the product. The product appears only after the idea is established.",
    "90-140 words, professional, no emojis, short paragraphs, one clear specifier-level CTA.",
    "Never read like a product specification sheet.",
  ].join("\n"),
  facebook: [
    "FACEBOOK — human, conversational, accessible to a non-technical reader.",
    "Structure: Relatable question or observation → simple explanation → product → light CTA.",
    "50-80 words, short paragraphs, plain language, exactly one engagement question.",
    "Must NOT sound like LinkedIn: no jargon like 'specification', 'rough-in', 'coherence'. At most one emoji, optional.",
  ].join("\n"),
  instagram: [
    "INSTAGRAM — visual-first and emotive.",
    "Structure: Visual hook (2 short punchy lines) → design idea → product line with finish → short CTA.",
    "25-55 words total, line breaks between beats, evocative not technical.",
    "Must NOT be a shortened LinkedIn caption.",
  ].join("\n"),
};

export function productFactsBlock(product: Record<string, unknown> | null) {
  if (!product) return "FEATURED PRODUCT: none — write about a design principle only, with no product-specific claims.";
  return ["FEATURED PRODUCT (the ONLY source of product facts):", JSON.stringify(product)].join("\n");
}

export function referenceImagesBlock(images: Array<Record<string, unknown>>) {
  if (!images.length) return "OFFICIAL PRODUCT IMAGES: none available.";
  return [
    "OFFICIAL PRODUCT IMAGES (visual ground truth — the generated image must match this product's real geometry):",
    JSON.stringify(images),
  ].join("\n");
}

