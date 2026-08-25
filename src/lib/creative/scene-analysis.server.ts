import { z } from "zod";

import { genObject } from "@/lib/agents.server";

/**
 * Scene analysis schemas — what Gemini Vision extracts from a reference image.
 *
 * Every field is grounded in what the model can actually see. The system prompt
 * explicitly forbids guessing: if a product category is unclear, it reports
 * "other" with low confidence rather than hallucinating a faucet where there is
 * a towel rack.
 */

export const detectedProductSchema = z.object({
  category: z.enum([
    "faucet",
    "shower",
    "accessory",
    "basin",
    "toilet",
    "bathtub",
    "mirror",
    "cabinet",
    "other",
  ]),
  description: z.string().describe("Brief visual description of the product"),
  position: z
    .object({
      x: z.number().min(0).max(1).describe("Left edge, normalised 0-1"),
      y: z.number().min(0).max(1).describe("Top edge, normalised 0-1"),
      width: z.number().min(0).max(1).describe("Width, normalised 0-1"),
      height: z.number().min(0).max(1).describe("Height, normalised 0-1"),
    })
    .describe("Bounding box of the product in the image"),
  finish: z
    .string()
    .describe("Detected finish: chrome, matte black, brushed gold, brushed nickel, etc."),
  confidence: z.number().min(0).max(1).describe("How sure the model is about this detection"),
});

export const surfaceSchema = z.object({
  type: z.enum(["marble", "concrete", "wood", "tile", "glass", "metal", "stone", "other"]),
  color: z.string().describe("Dominant hex colour of the surface"),
  reflectivity: z.enum(["high", "medium", "low"]),
});

export const sceneAnalysisSchema = z.object({
  scene_type: z.enum(["bathroom", "villa", "kitchen", "showroom", "outdoor", "other"]),
  description: z.string().describe("One-sentence description of the scene"),
  surfaces: z.array(surfaceSchema).describe("Major surfaces visible in the scene"),
  lighting: z.object({
    direction: z.enum(["left", "right", "top", "bottom", "ambient", "mixed"]),
    temperature: z.enum(["warm", "cool", "neutral"]),
    intensity: z.enum(["bright", "medium", "dim"]),
  }),
  detected_products: z
    .array(detectedProductSchema)
    .describe("Products visible in the scene that could be replaced"),
  color_palette: z
    .array(z.string())
    .max(8)
    .describe("Dominant hex colours in the scene, most frequent first"),
  mood: z.string().describe("Overall mood: luxury, modern, minimal, rustic, etc."),
});

export type DetectedProduct = z.infer<typeof detectedProductSchema>;
export type SurfaceInfo = z.infer<typeof surfaceSchema>;
export type SceneAnalysis = z.infer<typeof sceneAnalysisSchema>;

const ANALYSIS_SYSTEM_PROMPT = `You are an expert interior design and product photography analyst.

Your job is to analyse a reference image (typically a bathroom, villa interior, or luxury space) and extract structured information about:
1. The type of scene and its mood
2. All surfaces visible (their material, colour, reflectivity)
3. The lighting conditions (direction, temperature, intensity)
4. Every product/fixture visible that could potentially be replaced — with its approximate bounding box, category, finish, and confidence level
5. The dominant colour palette

RULES:
- Report ONLY what you can actually see. Never guess or infer.
- If a product category is uncertain, use "other" with low confidence.
- Bounding boxes are normalised (0-1) relative to image dimensions.
- Be precise about finishes: chrome is different from brushed nickel, matte black is different from oil-rubbed bronze.
- A scene may have 0 products (empty room) or many (fully furnished bathroom).
- When in doubt about reflectivity, lean towards "medium".`;

/**
 * Analyses a reference image using Gemini Vision and returns structured
 * information about the scene, products, lighting, and surfaces.
 */
export async function analyzeScene(imageUrl: string): Promise<SceneAnalysis> {
  const result = await genObject({
    schema: sceneAnalysisSchema,
    system: ANALYSIS_SYSTEM_PROMPT,
    prompt: `Analyse this interior/product scene image. Identify:
1. Scene type and mood
2. All visible surfaces (material, colour, reflectivity)
3. Lighting direction, temperature, and intensity
4. Every product/fixture visible — with bounding box (normalised 0-1), category, finish, and confidence
5. Dominant colour palette (up to 8 hex colours)

Focus especially on any bathroom fixtures: faucets, shower heads, accessories, basins, toilets, bathtubs, mirrors. These are the products that will be replaced.`,
    images: [imageUrl],
  });

  return result as SceneAnalysis;
}

/**
 * Maps a detected product category to the Steinheim product categories.
 * Used to match AI-detected products against the catalog.
 */
export const CATEGORY_MAP: Record<string, string[]> = {
  faucet: ["faucet", "tap", "mixer", "basin mixer", "kitchen faucet", "bath filler"],
  shower: ["shower", "shower head", "shower system", "rain shower", "hand shower", "shower column"],
  accessory: [
    "accessory",
    "towel rail",
    "towel bar",
    "soap dispenser",
    "hook",
    "ring",
    "robe hook",
    "toilet paper holder",
    "accessory set",
  ],
  basin: ["basin", "sink", "washbasin", "vanity"],
  toilet: ["toilet", "wc", "commode", "bidet"],
  bathtub: ["bathtub", "bath", "freestanding bath", "jacuzzi"],
  mirror: ["mirror", "cabinet mirror", "illuminated mirror"],
  cabinet: ["cabinet", "vanity unit", "storage"],
};
