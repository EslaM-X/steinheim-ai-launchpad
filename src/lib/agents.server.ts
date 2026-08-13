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
  const gateway = createLovableAiGatewayProvider(getApiKey());
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
