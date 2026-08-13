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
  tone_of_voice: string | null;
  key_messages: string[];
  forbidden: string[];
  website: string | null;
};

export function brandSystemPrompt(brand: Brand | null) {
  if (!brand) return "You are a marketing agent for Steinheim, a premium German bathroom brand in Egypt.";
  return [
    `You work for ${brand.brand_name} — ${brand.tagline ?? ""}.`,
    `Positioning: ${brand.positioning ?? ""}`,
    `Tone of voice: ${brand.tone_of_voice ?? ""}`,
    `Key messages: ${brand.key_messages.join(" | ")}`,
    `Never do this: ${brand.forbidden.join(" | ")}`,
    `Website: ${brand.website ?? ""}`,
    "Only use product facts given to you. Never invent specifications, certifications, prices or clients.",
  ].join("\n");
}

export function knowledgeBlock(input: {
  products: Array<Record<string, unknown>>;
  audiences: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  recentTopics: string[];
}) {
  return [
    "PRODUCTS:",
    JSON.stringify(input.products),
    "AUDIENCES:",
    JSON.stringify(input.audiences),
    "REFERENCE PROJECTS:",
    JSON.stringify(input.projects),
    "RECENTLY USED TOPICS (do not repeat):",
    input.recentTopics.join(" | ") || "none",
  ].join("\n");
}

/** Hard rules every writing agent inherits: no invented facts, ever. */
export const FACT_DISCIPLINE = [
  "FACT DISCIPLINE (absolute):",
  "- You may only state a technical fact that appears verbatim in the supplied product data or approved_claims.",
  "- Never invent specifications, cartridges, flow rates, certifications, warranties, dimensions, prices, clients or awards.",
  "- Never use a SKU that is not in the supplied product data.",
  "- Never state anything listed in forbidden_claims.",
  "- If a fact is not available, write around it with a design idea instead of guessing.",
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
