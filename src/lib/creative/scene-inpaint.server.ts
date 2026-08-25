import { getApiKey, getBaseUrl } from "@/lib/ai-provider.server";
import type { DetectedProduct } from "./scene-analysis.server";

/**
 * Scene inpainting — removes products from a reference image using
 * Gemini Image Editing. The model receives the original scene plus a
 * text instruction describing what to remove, and fills the area with
 * surrounding context.
 *
 * This is deliberately conservative: each product is removed one at a
 * time to avoid the model losing track of multiple removals in a single
 * pass. The intermediate results are fed back as input for the next
 * removal.
 */

interface InpaintResult {
  /** Data URL of the cleaned scene (no products). */
  imageUrl: string;
  /** Number of products successfully removed. */
  removed: number;
  /** Any warnings from the process. */
  warnings: string[];
}

/**
 * Removes all detected products from a scene image, one at a time,
 * returning the cleaned scene with no products visible.
 */
export async function removeProductsFromScene(
  sceneImageUrl: string,
  products: DetectedProduct[],
): Promise<InpaintResult> {
  const apiKey = getApiKey();
  const warnings: string[] = [];
  let currentImage = sceneImageUrl;
  let removed = 0;

  // Sort by confidence descending — remove the most certain products first
  // so that uncertain ones don't get confused with already-inpainted areas.
  const sorted = [...products]
    .filter((p) => p.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence);

  for (const product of sorted) {
    try {
      const instruction = buildRemovalInstruction(product);
      currentImage = await callImageEdit(apiKey, currentImage, instruction);
      removed++;
    } catch (error) {
      warnings.push(
        `Failed to remove ${product.category} (${product.description}): ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return { imageUrl: currentImage, removed, warnings };
}

/**
 * Removes a single product from a scene image.
 * Used for targeted removal when the user selects specific products.
 */
export async function removeSingleProduct(
  sceneImageUrl: string,
  product: DetectedProduct,
): Promise<string> {
  const apiKey = getApiKey();
  const instruction = buildRemovalInstruction(product);
  return callImageEdit(apiKey, sceneImageUrl, instruction);
}

function buildRemovalInstruction(product: DetectedProduct): string {
  const pos = product.position;
  const region = `approximately at position x=${(pos.x * 100).toFixed(0)}%, y=${(pos.y * 100).toFixed(0)}%, width=${(pos.width * 100).toFixed(0)}%, height=${(pos.height * 100).toFixed(0)}% of the image`;

  return `Remove the ${product.category} (${product.description}) ${region}.

Replace it seamlessly with the surrounding surface and wall material. The result should look like the product was never there — preserve the marble/tile/concrete texture, lighting gradients, and any reflections on the surface. Do not add any new objects. Keep all other elements in the scene exactly as they are.`;
}

async function callImageEdit(
  apiKey: string,
  sourceImageUrl: string,
  instruction: string,
): Promise<string> {
  const response = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env["AI_IMAGE_MODEL"] ?? "google/gemini-3.1-flash-image",
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: sourceImageUrl } },
            { type: "text", text: instruction },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image edit failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const url = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("The model returned no edited image.");
  return url;
}
